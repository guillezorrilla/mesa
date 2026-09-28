import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import type { Agent } from '../agents/names.js';
import { supportsPlanStart } from '../agents/names.js';
import { MesaError } from '../lib/result.js';
import { GENERAL_PROJECT } from './general.js';
import { FINAL_STATES, SESSION_STATES } from './states.js';
import { WORKFLOW_STATUSES } from './workflow-status.js';

// A session record's shape and the rules on it (CONTEXT.md, Session); the store keeps them.

const SHORT_ID = /^[0-9a-z]{8}$/;
/** An 8-character Mesa session id, so one from outside (a hook's env) never becomes a path. */
export const isSessionId = (id: string) => SHORT_ID.test(id);

const FOREIGN = 'ext-';
/** An id on a foreign session's board row, which no record has. */
export const isForeignId = (id: string) => id.startsWith(FOREIGN);
/**
 * A foreign session's board id (CONTEXT.md): `ext-<pid>`, or `ext-<agent session id>` from a
 * listing that names no process (Codex's). No record has it, so every lookup refuses it.
 */
export const foreignId = (p: { pid?: number; agentSessionId: string }) =>
  `${FOREIGN}${p.pid ?? p.agentSessionId}` as const;

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
   * --branch), and `claimedAt`, set under the record's lock by whoever starts it, so it starts
   * once. Gone once it starts.
   */
  pending: z
    .strictObject({
      branch: z.string().optional(),
      base: z.string().optional(),
      claimedAt: z.iso.datetime().optional(),
    })
    .optional(),
  /** What a person calls it (mesa rename, mesa adopt --name). */
  name: z.string().optional(),
  /** A person's workflow label, independent of Faro's observed agent state. */
  workflowStatus: z.enum(WORKFLOW_STATUSES).optional(),
  /** Started outside Mesa, then adopted (CONTEXT.md, Adopted session). */
  adopted: z.literal(true).optional(),
  /**
   * The folder its agent runs in, when that is neither the project's nor its worktree: an adopted
   * session's own, where claude keeps its conversation.
   */
  cwd: z.string().optional(),
  /** The git worktree it runs in (mesa open --branch; CONTEXT.md, Worktree). */
  worktree: z
    .strictObject({ path: z.string(), branch: z.string(), base: z.string().optional() })
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
     * ADR-0003's signals (hook, listing, tmux, and tmux's pane-died hook), Faro's adapter when the
     * rules were unsure, or Mesa's own action (open, stop).
     */
    source: z.enum(['hook', 'listing', 'tmux', 'tmux-hook', 'adapter', 'mesa']),
    /** With `adapter`: a hash of what it saw, so an unchanged session is not asked again. */
    basis: z.string().optional(),
  }),
  lastOutput: z.string().optional(),
  /**
   * How much of its context window it has used (CONTEXT.md, Context use): `used` in percent of
   * `window` tokens, as of its agent's reply at `at`. Absent while there is no reading.
   */
  context: z
    .strictObject({
      used: z.number().min(0),
      window: z.number().int().positive(),
      at: z.iso.datetime({ offset: true }),
      source: z.literal('transcript'),
      /** The model that produced this reading, when the native transcript names it. */
      model: z.string().optional(),
    })
    .optional(),
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
  /** The session it continues, which handed off to it (CONTEXT.md, Handoff). */
  handoffFrom: z.string().regex(SHORT_ID).optional(),
  resumedFrom: z.string().optional(),
  resumedBy: z.string().optional(),
});

export const SessionRecordSchema = SessionRecordFields.refine(
  (record) =>
    (record.kind === 'terminal') === (record.agent === 'terminal') &&
    (record.kind !== 'terminal' || (!record.agentSessionId && !record.goal)) &&
    (record.mode !== 'plan' || (record.agent !== 'terminal' && supportsPlanStart(record.agent))) &&
    (!record.background || record.agent === 'claude') &&
    (!record.backgroundId || record.background) &&
    (record.project !== GENERAL_PROJECT ||
      (Boolean(record.cwd && isAbsolute(record.cwd)) && !record.worktree)),
  'plain terminals need terminal kind and agent; General sessions need an absolute cwd and no worktree',
);
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
/** A plain terminal has no coding agent or provider conversation. */
export const recordAgent = (record: Pick<SessionRecord, 'agent'>): Agent | undefined =>
  record.agent === 'terminal' ? undefined : record.agent;
export type ContextUse = NonNullable<SessionRecord['context']>;
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
export const sessionEnded = () => new MesaError('not_found', 'session ended; use mesa resume');
