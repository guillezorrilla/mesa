import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { type HookEvent, parentHook, readHookEvents } from '../sessions/hook-events.js';

export type InboxItem = {
  id: string;
  session: string;
  at: string;
  kind: 'input-required' | 'finished' | 'subagent';
  title: string;
  read: boolean;
  target: { kind: 'session'; id: string };
};

const State = z.strictObject({ read: z.array(z.string()), cleared: z.array(z.string()) });
type State = z.infer<typeof State>;
const EMPTY: State = { read: [], cleared: [] };
type Candidate = Pick<InboxItem, 'session' | 'at' | 'kind' | 'title'> & { fingerprint: string };

function itemFor(session: string, event: HookEvent): Candidate | undefined {
  if (!Number.isFinite(Date.parse(event.at))) return undefined;
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {};
  const child = !parentHook(event);
  const question = payload.tool_name === 'AskUserQuestion';
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
  return { session, at: event.at, kind, title, fingerprint };
}

/** An inbox derived from the profile's redacted hooks; only read/clear markers need their own file. */
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
  const write = (state: State) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const lock = `${file}.lock`;
    return withLockSync(
      lock,
      () => {
        const current = read();
        const next = {
          read: [...new Set([...current.read, ...state.read])],
          cleared: [...new Set([...current.cleared, ...state.cleared])],
        };
        writeFileAtomic(file, `${JSON.stringify(next, null, 2)}\n`, 0o600);
        return next;
      },
      () => lockedBy('inbox', lock, 'notifications'),
    );
  };
  const list = (): InboxItem[] => {
    const entries = ctx.store.list().flatMap((record) =>
      readHookEvents(ctx.paths.events, record.id).flatMap((event) => {
        const item = itemFor(record.id, event);
        return item ? [item] : [];
      }),
    );
    entries.sort((a, b) => a.at.localeCompare(b.at));
    const distinct: typeof entries = [];
    const last = new Map<string, number>();
    for (const entry of entries) {
      const at = Date.parse(entry.at);
      if (at - (last.get(entry.fingerprint) ?? -Infinity) < 2_000) continue;
      distinct.push(entry);
      last.set(entry.fingerprint, at);
    }
    const state = read();
    // ponytail: only the latest 500 events are shown; index hook logs if large profiles need more.
    return distinct
      .slice(-500)
      .filter((entry) => !state.cleared.includes(`${entry.at}:${entry.fingerprint}`))
      .map(({ fingerprint, ...entry }) => ({
        ...entry,
        id: `${entry.at}:${fingerprint}`,
        read: state.read.includes(`${entry.at}:${fingerprint}`),
        target: { kind: 'session' as const, id: entry.session },
      }))
      .reverse();
  };
  const change = (id: string, field: 'read' | 'cleared') => {
    if (!list().some((item) => item.id === id))
      throw new MesaError('not_found', `no inbox item ${id}`);
    write({ read: field === 'read' ? [id] : [], cleared: field === 'cleared' ? [id] : [] });
  };
  return {
    list,
    markRead: (id: string) => change(id, 'read'),
    clear: (id: string) => change(id, 'cleared'),
  };
}
