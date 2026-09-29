import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import type { DoctorReport } from '../doctor.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { type HookEvent, parentHook, scanHookEvents } from '../sessions/hook-events.js';

export type InboxItem = {
  id: string;
  session: string;
  at: string;
  kind: 'input-required' | 'finished' | 'subagent' | 'doctor';
  title: string;
  read: boolean;
  target: { kind: 'session'; id: string } | { kind: 'doctor' };
};

export type DeliveryPlan =
  | { kind: 'none' }
  | {
      kind: 'notice' | 'digest';
      id: string;
      ids: string[];
      title: string;
      body: string;
      sound: boolean;
      target: { kind: 'session'; id: string } | { kind: 'inbox' } | { kind: 'doctor' };
    };

const CandidateSchema = z.strictObject({
  session: z.string(),
  at: z.iso.datetime(),
  kind: z.enum(['input-required', 'finished', 'subagent', 'doctor']),
  title: z.string(),
  fingerprint: z.string(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('session'), id: z.string() }),
    z.strictObject({ kind: z.literal('doctor') }),
  ]),
});
type Candidate = z.infer<typeof CandidateSchema>;

const State = z.strictObject({
  read: z.array(z.string()),
  cleared: z.array(z.string()),
  delivered: z.array(z.string()).default([]),
  items: z.array(CandidateSchema).default([]),
  offsets: z.record(z.string(), z.number().int().nonnegative()).default({}),
  doctor: z
    .array(
      z.object({
        at: z.iso.datetime(),
        name: z.string(),
        status: z.enum(['warn', 'fail']),
        fingerprint: z.string().optional(),
      }),
    )
    .default([]),
  startedAt: z.iso.datetime().optional(),
});
type State = z.infer<typeof State>;
const EMPTY: State = { read: [], cleared: [], delivered: [], doctor: [], items: [], offsets: {} };

const doctorItem = (finding: State['doctor'][number]): Candidate => ({
  session: '',
  at: finding.at,
  kind: 'doctor',
  title: `Doctor: ${finding.name}`,
  fingerprint:
    finding.fingerprint ??
    createHash('sha256').update(`${finding.name}:${finding.status}`).digest('hex').slice(0, 20),
  target: { kind: 'doctor' },
});

function itemFor(session: string, event: HookEvent): Candidate | undefined {
  if (!Number.isFinite(Date.parse(event.at))) return undefined;
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {};
  const child = !parentHook(event);
  const question = payload.tool_name === 'AskUserQuestion';
  // Claude Code's own background agents (such as an idle recap) stop with an empty agent_type
  // after every turn; only a subagent the session started is worth a notice.
  if (event.event === 'SubagentStop' && payload.agent_type === '') return undefined;
  const kind =
    event.event === 'PermissionRequest' || (event.event === 'PreToolUse' && question)
      ? child
        ? 'subagent'
        : 'input-required'
      : event.event === 'SubagentStop'
        ? 'subagent'
        : event.event === 'Stop' && !child
          ? 'finished'
          : undefined;
  if (!kind) return undefined;
  const title =
    kind === 'input-required'
      ? question
        ? 'Question needs an answer'
        : 'Session needs permission'
      : kind === 'finished'
        ? 'Session turn finished'
        : event.event === 'SubagentStop'
          ? 'Subagent finished'
          : 'Subagent needs permission';
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        session,
        kind,
        payload.agent_id ?? null,
        payload.tool_name ?? null,
        payload.tool_input ?? null,
      ]),
    )
    .digest('hex')
    .slice(0, 20);
  return {
    session,
    at: event.at,
    kind,
    title,
    fingerprint,
    target: { kind: 'session', id: session },
  };
}

/** A bounded, durable inbox projected from the profile's redacted hooks. */
export function inbox(ctx: MesaContext) {
  const file = ctx.paths.notifications;
  const read = (): State => {
    if (!existsSync(file)) return EMPTY;
    try {
      return parseWith(State, JSON.parse(readFileSync(file, 'utf8')), file);
    } catch (error) {
      if (error instanceof MesaError) throw error;
      throw new MesaError('invalid_config', `${file}: inbox state is not valid JSON`);
    }
  };
  const write = (state: Partial<State>) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const lock = `${file}.lock`;
    return withLockSync(
      lock,
      () => {
        const current = read();
        const entries = [...current.items, ...(state.items ?? [])].sort((a, b) =>
          a.at.localeCompare(b.at),
        );
        const distinct: Candidate[] = [];
        const last = new Map<string, number>();
        for (const entry of entries) {
          const at = Date.parse(entry.at);
          if (at - (last.get(entry.fingerprint) ?? -Infinity) < 2_000) continue;
          distinct.push(entry);
          last.set(entry.fingerprint, at);
        }
        const next = {
          read: [...new Set([...current.read, ...(state.read ?? [])])],
          cleared: [...new Set([...current.cleared, ...(state.cleared ?? [])])],
          // The inbox keeps 500 events, so 1,000 recent acknowledgements cover restart reads.
          delivered: [...new Set([...current.delivered, ...(state.delivered ?? [])])].slice(-1_000),
          items: distinct.slice(-500),
          offsets: Object.fromEntries(
            [
              ...new Set([...Object.keys(current.offsets), ...Object.keys(state.offsets ?? {})]),
            ].map((id) => [id, Math.max(current.offsets[id] ?? 0, state.offsets?.[id] ?? 0)]),
          ),
          doctor: state.doctor ?? current.doctor,
          startedAt: current.startedAt ?? state.startedAt,
        };
        const retained = new Set(
          [...next.items, ...next.doctor.map(doctorItem)].map(
            (item) => `${item.at}:${item.fingerprint}`,
          ),
        );
        next.read = next.read.filter((id) => retained.has(id));
        next.cleared = next.cleared.filter((id) => retained.has(id));
        writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`, 0o600);
        return next;
      },
      () => lockedBy('inbox', lock, 'notifications'),
    );
  };
  const list = (): InboxItem[] => {
    const current = read();
    const fresh: Candidate[] = [];
    const offsets: Record<string, number> = {};
    for (const record of ctx.store.list()) {
      const before = current.offsets[record.id] ?? 0;
      const after = scanHookEvents(ctx.paths.events, record.id, before, (event) => {
        const item = itemFor(record.id, event);
        if (item) fresh.push(item);
      });
      if (after !== before) offsets[record.id] = after;
    }
    const state =
      fresh.length || Object.keys(offsets).length ? write({ items: fresh, offsets }) : current;
    const entries: Candidate[] = [...state.items];
    entries.push(...state.doctor.map(doctorItem));
    entries.sort((a, b) => a.at.localeCompare(b.at));
    const cleared = new Set(state.cleared);
    const readIds = new Set(state.read);
    return entries
      .filter((entry) => !cleared.has(`${entry.at}:${entry.fingerprint}`))
      .map(({ fingerprint, ...entry }) => ({
        ...entry,
        id: `${entry.at}:${fingerprint}`,
        read: readIds.has(`${entry.at}:${fingerprint}`),
      }))
      .reverse();
  };
  const change = (id: string, field: 'read' | 'cleared') => {
    if (!list().some((item) => item.id === id))
      throw new MesaError('not_found', `no inbox item ${id}`);
    write({ read: field === 'read' ? [id] : [], cleared: field === 'cleared' ? [id] : [] });
  };
  const delivery = (): DeliveryPlan => {
    const state = read();
    const startedAt = state.startedAt ?? ctx.deps.clock().toISOString();
    if (!state.startedAt) write({ startedAt });
    const settings = ctx.open().config.notifications;
    const fresh = list().filter(
      (item) => item.at >= startedAt && !state.delivered.includes(item.id),
    );
    const mode = (item: InboxItem) =>
      settings[item.kind === 'input-required' ? 'inputRequired' : item.kind];
    const skipped = fresh.filter((item) => item.read || mode(item) === 'off');
    if (skipped.length) write({ delivered: skipped.map((item) => item.id) });
    const pending = fresh.filter((item) => !item.read && mode(item) !== 'off').slice(0, 500);
    if (settings.quiet || pending.length === 0) return { kind: 'none' };
    const ids = pending.map((item) => item.id);
    const item = pending[0];
    if (item && pending.length === 1) {
      return {
        kind: 'notice',
        id: item.id,
        ids,
        title: item.title,
        body: item.kind === 'doctor' ? 'Open Doctor to review and fix' : `Session ${item.session}`,
        sound: mode(item) === 'sound',
        target: item.target,
      };
    }
    return {
      kind: 'digest',
      id: `digest-${createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 20)}`,
      ids,
      title: `${ids.length} Mesa notices`,
      body: 'Open Inbox to review your sessions',
      sound: pending.some((item) => mode(item) === 'sound'),
      target: { kind: 'inbox' },
    };
  };
  const markDelivered = (ids: string[]) => {
    const state = read();
    const known = new Set([...list().map((item) => item.id), ...state.cleared, ...state.delivered]);
    if (!ids.length || ids.length > 500 || ids.some((id) => !known.has(id)))
      throw new MesaError('not_found', 'notification item not found');
    write({ delivered: ids });
  };
  return {
    list,
    markRead: (id: string) => change(id, 'read'),
    clear: (id: string) => change(id, 'cleared'),
    delivery,
    markDelivered,
    recordDoctor: (report: DoctorReport) => {
      const state = read();
      const now = ctx.deps.clock().toISOString();
      const findings = report.checks.filter((check) => check.status !== 'ok');
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(findings.map((check) => [check.name, check.status])))
        .digest('hex')
        .slice(0, 20);
      write({
        startedAt: state.startedAt ?? now,
        doctor: findings.length
          ? [
              {
                name: `${findings.length} finding${findings.length === 1 ? '' : 's'}`,
                status: findings.some((check) => check.status === 'fail') ? 'fail' : 'warn',
                fingerprint,
                at: state.doctor.find((entry) => entry.fingerprint === fingerprint)?.at ?? now,
              },
            ]
          : [],
      });
    },
  };
}
