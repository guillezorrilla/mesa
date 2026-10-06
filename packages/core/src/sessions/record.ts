import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import { ContextUseSchema } from '../agents/context-use.js';
import type { Agent } from '../agents/names.js';
import { supportsAgentCapability, supportsPlanStart } from '../agents/names.js';
import { ULID } from '../lib/ids.js';
import { MesaError } from '../lib/result.js';
import { ITEM_SOURCES } from '../sources/items.js';
import { GENERAL_PROJECT } from './general.js';
import { SESSION_ID_PATTERN as SHORT_ID } from './id.js';

import { FINAL_STATES, SESSION_STATES } from './states.js';
import { WORKFLOW_STATUSES } from './workflow-status.js';

export { isSessionId } from './id.js';

// A session record's shape and the rules on it (CONTEXT.md, Session); the store keeps them.

const FOREIGN = 'ext-';
/** An id on a foreign session's board row, which no record has. */
export const isForeignId = (id: string) => id.startsWith(FOREIGN);
/**
 * A foreign session's board id (CONTEXT.md): `ext-<pid>`, or `ext-<agent session id>` from a
 * listing that names no process (Codex's). No record has it, so every lookup refuses it.
 */
export const foreignId = (p: { pid?: number; agentSessionId: string }) =>
  `${FOREIGN}${p.pid ?? p.agentSessionId}` as const;

/** A session's own git worktree (CONTEXT.md, Worktree): the primary's, and each additional project's. */
const WorktreeSchema = z.strictObject({
  path: z.string(),
  branch: z.string(),
  base: z.string().optional(),
});

const SessionRecordFields = z.strictObject({
  /** Short: typed in `mesa stop <id>`. */
  id: z.string().regex(SHORT_ID),
  kind: z.enum(['interactive', 'run', 'terminal']),
  /** A reserved name for profile-owned General sessions, otherwise a registered project. */
  project: z.string(),
  agent: z.union([AgentSchema, z.literal('terminal')]),
  /** Native startup mode; absent keeps the provider's own default. */
  mode: z.literal('plan').optional(),
  /** Claude's native background handle; its terminal is only a view of that process. */
  backgroundId: z
    .string()
    .regex(/^[0-9a-f]{8}$/)
    .optional(),
  background: z.literal(true).optional(),
  /** Claude Code's session UUID, or Codex's thread id. */
  agentSessionId: z.string().optional(),
  /** The first prompt the agent was started with (CONTEXT.md, Goal). */
  goal: z.string().optional(),
  /** Provenance assigned before an automation's agent starts. */
  automation: z
    .strictObject({ rule: z.string().min(1).max(80), run: z.string().regex(ULID) })
    .optional(),
  /** The session this one was started from (CONTEXT.md, Parent session). */
  parent: z.string().regex(SHORT_ID).optional(),
  /**
   * The session a skill run is about (mesa run --session): its output log was the agent's stdin,
   * and where the skill's output lands may name it (skills/landing.ts).
   */
  about: z.string().regex(SHORT_ID).optional(),
  /** A failed run keeps its outcome when the hook and waiter both finish it. */
  runFailure: z.string().optional(),
  /** The session it waits on, while queued, and the one it waited on after (CONTEXT.md, Queued session). */
  after: z.string().regex(SHORT_ID).optional(),
  /**
   * A queued session's start, still to come: the worktree it gets then (mesa open --after
   * --branch), the additional projects that each get one on that branch too (--with), and
   * `claimedAt`, set under the record's lock by whoever starts it, so it starts once. Gone once it
   * starts.
   */
  pending: z
    .strictObject({
      branch: z.string().optional(),
      base: z.string().optional(),
      with: z.array(z.string()).min(1).optional(),
      claimedAt: z.iso.datetime().optional(),
    })
    .optional(),
  /** What a person calls it (mesa rename, mesa adopt --name). */
  name: z.string().optional(),
  /** What its agent calls it, as the listing last named it (Claude Code's /rename); `name` wins. */
  agentName: z.string().optional(),
  /** A person's workflow label, independent of Faro's observed agent state. */
  workflowStatus: z.enum(WORKFLOW_STATUSES).optional(),
  /** Started outside Mesa, then adopted (CONTEXT.md, Adopted session). */
  adopted: z.literal(true).optional(),
  /**
   * Its agent was launched with mesa-vault mounted (agents/vault-mount.ts). None on a record only
   * recorded (mesa adopt --no-resume), queued, or launched before the mount existed.
   */
  vaultMounted: z.literal(true).optional(),
  /**
   * The folder its agent runs in, when that is neither the project's nor its worktree: an adopted
   * session's own, where claude keeps its conversation.
   */
  cwd: z.string().optional(),
  /** The git worktree it runs in (mesa open --branch; CONTEXT.md, Worktree). */
  worktree: WorktreeSchema.optional(),
  /**
   * The other projects it works in, each in its own worktree on the session's branch (mesa open
   * --with; CONTEXT.md, Additional project). Absent means none.
   */
  additional: z
    .array(z.strictObject({ project: z.string(), worktree: WorktreeSchema }))
    .min(1)
    .optional(),
  tmux: z.strictObject({ socket: z.string(), session: z.string(), window: z.string() }),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().optional(),
  /** Hidden from the active board while retaining the record and logs for later review. */
  archivedAt: z.iso.datetime().optional(),
  lastState: z.strictObject({
    state: z.enum(SESSION_STATES),
    confidence: z.number().min(0).max(1),
    at: z.iso.datetime(),
    /**
     * ADR-0003's signals (hook, listing, tmux, and tmux's pane-died hook), or Mesa's own action
     * (open, stop). `adapter`, with the `basis` hash it saw, is what Faro's adapter saved before
     * ADR-0020 removed it: such a record still loads, and its next reading replaces both.
     */
    source: z.enum(['hook', 'listing', 'tmux', 'tmux-hook', 'adapter', 'mesa']),
    basis: z.string().optional(),
  }),
  lastOutput: z.string().optional(),
  /** Current native browser element; cleared when its page or session changes. */
  browserSelection: z
    .strictObject({
      source: z.string().regex(/^[0-9a-f]{64}$/),
      revision: z.string().regex(/^[0-9a-f]{64}$/),
      ownerPid: z.number().int().positive(),
      ownerSocket: z.string().optional(),
    })
    .optional(),
  /** Its last context use reading (CONTEXT.md, Context use); absent while there is none. */
  context: ContextUseSchema.optional(),
  /**
   * What happened to the session that Mesa keeps: prompts sent to it and by it, its agent's
   * exit, and a handoff. Claude Code's hook events go to sessions/events/ instead.
   */
  events: z.array(
    z.discriminatedUnion('type', [
      z.strictObject({
        type: z.literal('send'),
        at: z.iso.datetime(),
        chars: z.number(),
        /** The session that sent it (mesa send --from). */
        from: z.string().regex(SHORT_ID).optional(),
      }),
      /**
       * Its agent exited: tmux's pane-died hook said so (mesa hook tmux), or a run's end saw it
       * (endRun), with its exit status or the signal that killed it, as the dead pane showed.
       */
      z.strictObject({
        type: z.literal('exited'),
        at: z.iso.datetime(),
        status: z.number().int().optional(),
        signal: z.string().optional(),
      }),
      z.strictObject({
        type: z.literal('sent'),
        at: z.iso.datetime(),
        chars: z.number(),
        to: z.string().regex(SHORT_ID),
      }),
      z.strictObject({
        type: z.literal('review'),
        at: z.iso.datetime(),
        id: z.string().regex(/^[0-9a-f]{64}$/),
        source: z.string().regex(/^[0-9a-f]{64}$/),
        revision: z.string().regex(/^[0-9a-f]{64}$/),
        passage: z.string(),
        comment: z.string(),
        kind: z.enum(['response', 'change', 'browser']).optional(),
        path: z.string().optional(),
        baseKind: z.enum(['HEAD', 'index']).optional(),
        base: z.string().optional(),
        staged: z.boolean().optional(),
        url: z.string().optional(),
        selector: z.string().optional(),
        status: z.enum(['pending', 'delivered', 'failed', 'uncertain']),
        reason: z.string().optional(),
      }),
      /** Handed off (mesa handoff): to its successor, or, on the successor, from the session. */
      z.strictObject({
        type: z.literal('handoff'),
        at: z.iso.datetime(),
        from: z.string().regex(SHORT_ID).optional(),
        to: z.string().regex(SHORT_ID).optional(),
        /** The handoff note, under the profile's handoffs/. */
        note: z.string(),
      }),
    ]),
  ),
  /** The imported item it was started from (mesa open --from; CONTEXT.md, Import). */
  from: z.strictObject({ source: z.enum(ITEM_SOURCES), id: z.string() }).optional(),
  /** The session it continues, which handed off to it (CONTEXT.md, Handoff). */
  handoffFrom: z.string().regex(SHORT_ID).optional(),
  resumedFrom: z.string().optional(),
  resumedBy: z.string().optional(),
});

/**
 * Additional projects' structure (CONTEXT.md, Additional project): a project session with its own
 * worktree, and each other project once. Their shared branch is checked at open.
 */
const validAdditional = (r: z.infer<typeof SessionRecordFields>) => {
  if (!r.additional) return true;
  const projects = r.additional.map((a) => a.project);
  return (
    r.project !== GENERAL_PROJECT &&
    Boolean(r.worktree) &&
    !projects.includes(r.project) &&
    new Set(projects).size === projects.length
  );
};

export const SessionRecordSchema = SessionRecordFields.refine(
  (record) =>
    (record.kind === 'terminal') === (record.agent === 'terminal') &&
    (record.kind !== 'terminal' || (!record.agentSessionId && !record.goal)) &&
    (record.mode !== 'plan' || (record.agent !== 'terminal' && supportsPlanStart(record.agent))) &&
    (!record.background ||
      (record.agent !== 'terminal' && supportsAgentCapability(record.agent, 'background'))) &&
    (!record.backgroundId || record.background) &&
    (record.project !== GENERAL_PROJECT ||
      (Boolean(record.cwd && isAbsolute(record.cwd)) && !record.worktree)) &&
    validAdditional(record),
  'plain terminals need terminal kind and agent; General sessions need an absolute cwd and no worktree; additional projects need a project worktree and are each another project, once',
);
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
/** A plain terminal has no coding agent or provider conversation. */
export const recordAgent = (record: Pick<SessionRecord, 'agent'>): Agent | undefined =>
  record.agent === 'terminal' ? undefined : record.agent;
export type NewSession = Omit<SessionRecord, 'id' | 'events'>;

/** Its agent is through: stopped, or seen done or failed. A queue waits for this (CONTEXT.md, Queued session). */
export const isOver = (r: Pick<SessionRecord, 'endedAt' | 'lastState'>) =>
  Boolean(r.endedAt) || FINAL_STATES.has(r.lastState.state);

/**
 * What ending a record at `at` sets: `endedAt` (when it was seen done or failed, if it was), and
 * `done` unless it had already finished; a `failed` stays failed.
 */
export function ending(r: SessionRecord, at: string): Pick<SessionRecord, 'endedAt' | 'lastState'> {
  if (FINAL_STATES.has(r.lastState.state)) {
    return { endedAt: r.endedAt ?? r.lastState.at, lastState: r.lastState };
  }
  return {
    endedAt: r.endedAt ?? at,
    lastState: { state: 'done', confidence: 1, at, source: 'mesa' },
  };
}

/**
 * A skill run (CONTEXT.md, Skill run) takes no prompt and no handoff: its agent reads no input
 * and ends by itself. `what` is what was asked of it.
 */
export function refuseRun(r: Pick<SessionRecord, 'id' | 'kind'>, what: string) {
  if (r.kind === 'run') {
    throw new MesaError(
      'usage',
      `session ${r.id} is a skill run (mesa run), which ${what}: its agent reads no input and ends by itself`,
    );
  }
}

/** A session with no live window: nothing to attach to or type into, only to resume. */
export const sessionEnded = () =>
  new MesaError('not_found', 'session ended; use mesa resume', { safeNoSend: true });
