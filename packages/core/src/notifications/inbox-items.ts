import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DoctorReport } from '../doctor/doctor.js';
import { type HookEvent, parentHook } from '../sessions/hook-events.js';

/** The one Mesa command that fixes a Doctor notice, when there is one. */
export type InboxFix = 'hooks install' | 'vault init';

export type InboxItem = {
  id: string;
  session: string;
  at: string;
  kind: 'input-required' | 'finished' | 'subagent' | 'doctor' | 'automation';
  title: string;
  /** A Doctor notice's one-line explanation. */
  detail?: string;
  fix?: InboxFix;
  read: boolean;
  target: { kind: 'session'; id: string } | { kind: 'doctor' } | { kind: 'automations' };
};

export const CandidateSchema = z.strictObject({
  session: z.string(),
  at: z.iso.datetime(),
  kind: z.enum(['input-required', 'finished', 'subagent', 'doctor', 'automation']),
  title: z.string(),
  detail: z.string().optional(),
  fix: z.enum(['hooks install', 'vault init']).optional(),
  fingerprint: z.string(),
  target: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('session'), id: z.string() }),
    z.strictObject({ kind: z.literal('doctor') }),
    z.strictObject({ kind: z.literal('automations') }),
  ]),
});
/** A notice before the inbox marks it: its fingerprint and time make its id. */
export type Candidate = z.infer<typeof CandidateSchema>;

export const DoctorFindingSchema = z.object({
  at: z.iso.datetime(),
  name: z.string(),
  status: z.enum(['warn', 'fail']),
  fingerprint: z.string().optional(),
  detail: z.string().optional(),
  fix: z.enum(['hooks install', 'vault init']).optional(),
});
type DoctorFinding = z.infer<typeof DoctorFindingSchema>;

/** The fields of an automation run that its failure notice reads; the run ledger owns runs. */
export type AutomationRunNotice = {
  id: string;
  status: string;
  endedAt?: string | undefined;
  trigger: { at: string };
  rule: { name: string };
  reason?: string | undefined;
};

/** What each fix's notice says: the findings it covers become one notice. */
const FIXES: Record<InboxFix, { title: string; detail: string }> = {
  'hooks install': {
    title: 'Session hooks are not enabled',
    detail: "Mesa can't tell when a coding agent needs you or finishes a turn.",
  },
  'vault init': {
    title: 'Vault is not set up',
    detail: "Sessions can't save notes, decisions, or receipts until it is laid out.",
  },
};

/** One notice per fix that Doctor's hints name, and one per finding with no such fix. */
export function doctorFindings(report: DoctorReport) {
  const findings = report.checks.filter((check) => check.status !== 'ok');
  const groups = new Map<string, { name: string; fix?: InboxFix; checks: typeof findings }>();
  for (const check of findings) {
    const fix = Object.keys(FIXES).find((command) => check.hint.includes(`\`mesa ${command}\``)) as
      | InboxFix
      | undefined;
    const key = fix ?? `check:${check.name}`;
    const group = groups.get(key) ?? { name: fix ? FIXES[fix].title : check.name, fix, checks: [] };
    group.checks.push(check);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ name, fix, checks }) => ({
    name,
    status: checks.some((check) => check.status === 'fail') ? ('fail' as const) : ('warn' as const),
    detail: fix ? FIXES[fix].detail : checks[0]?.hint,
    ...(fix ? { fix } : {}),
    // A fix's notice is one thing to do: fixing one of its checks keeps it read or cleared.
    fingerprint: createHash('sha256')
      .update(
        JSON.stringify(
          fix ? [name, checks.some((check) => check.status === 'fail')] : [name, checks[0]?.status],
        ),
      )
      .digest('hex')
      .slice(0, 20),
  }));
}

export const doctorItem = (finding: DoctorFinding): Candidate => ({
  session: '',
  at: finding.at,
  kind: 'doctor',
  title: finding.fix ? finding.name : `Doctor: ${finding.name}`,
  ...(finding.detail ? { detail: finding.detail } : {}),
  ...(finding.fix ? { fix: finding.fix } : {}),
  fingerprint:
    finding.fingerprint ??
    createHash('sha256').update(`${finding.name}:${finding.status}`).digest('hex').slice(0, 20),
  target: { kind: 'doctor' },
});

/** The notice a session's hook event raises, if any. */
export function hookItem(session: string, event: HookEvent): Candidate | undefined {
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

/** One notice per failed run among the latest 500 failures. */
export const failureItems = (runs: readonly AutomationRunNotice[]): Candidate[] =>
  runs
    .filter((run) => run.status === 'failed')
    .slice(-500)
    .map((run) => ({
      session: '',
      at: run.endedAt ?? run.trigger.at,
      kind: 'automation',
      title: `Automation failed: ${run.rule.name}`,
      detail: run.reason ?? 'Review the failed run in Automations.',
      fingerprint: `automation:${run.id}`,
      target: { kind: 'automations' },
    }));
