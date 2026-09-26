import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import { MesaError } from '../lib/result.js';

// A session record's shape and the rules on it (CONTEXT.md, Session); the store keeps them.

/** Where a session's agent is: what Faro reads from its signals (CONTEXT.md, Session state). */
export const AGENT_STATES = [
  'working',
  'waiting-permission',
  'waiting-question',
  'idle',
  'done',
  'failed',
] as const;
/**
 * An agent's states, and Mesa's own for a session whose agent never ran: `queued` until the
 * session it waits on ends (mesa open --after), `stopped` once cancelled. Mesa sets those; Faro
 * never reads them.
 */
export const SESSION_STATES = [...AGENT_STATES, 'queued', 'stopped'] as const;
export type SessionState = (typeof SESSION_STATES)[number];
/** Whether Faro places a session in this state, rather than Mesa holding it there. */
export const isAgentState = (state: SessionState) =>
  (AGENT_STATES as readonly string[]).includes(state);

const SHORT_ID = /^[0-9a-z]{8}$/;
/** An 8-character Mesa session id, so one from outside (a hook's env) never becomes a path. */
export const isSessionId = (id: string) => SHORT_ID.test(id);

const FOREIGN = 'ext-';
/** An id on a foreign session's board row, which no record has. */
export const isForeignId = (id: string) => id.startsWith(FOREIGN);
/** A foreign session's board id (CONTEXT.md): no record has it, so every lookup refuses it. */
export const foreignId = (pid: number) => `${FOREIGN}${pid}` as const;

export const SessionRecordSchema = z.strictObject({
  /** Short: typed in `mesa stop <id>`. */
  id: z.string().regex(SHORT_ID),
  kind: z.enum(['interactive', 'run']),
  project: z.string(),
  agent: AgentSchema,
  /** Claude Code's session UUID. */
  agentSessionId: z.string().optional(),
  /** The first prompt the agent was started with (CONTEXT.md, Goal). */
  goal: z.string().optional(),
  /** The session this one was started from (CONTEXT.md, Parent session). */
  parent: z.string().regex(SHORT_ID).optional(),
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
  /** What a person calls it (mesa adopt --name). */
  name: z.string().optional(),
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
   * What happened to the session that Mesa keeps: prompts sent to it and by it, and its agent's
   * exit. Claude Code's hook events go to sessions/events/ instead.
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
      /** Its agent exited: tmux's pane-died hook said so (mesa hook tmux). */
      z.strictObject({ type: z.literal('exited'), at: z.iso.datetime() }),
      z.strictObject({
        type: z.literal('sent'),
        at: z.iso.datetime(),
        chars: z.number(),
        to: z.string().regex(SHORT_ID),
      }),
    ]),
  ),
  resumedFrom: z.string().optional(),
  resumedBy: z.string().optional(),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type NewSession = Omit<SessionRecord, 'id' | 'events'>;

/** States a session does not leave on its own; distinct from ended (stopped, with `endedAt`). */
export const FINAL_STATES: ReadonlySet<SessionState> = new Set(['done', 'failed', 'stopped']);

/** Its agent is through: stopped, or seen done or failed. A queue waits for this (CONTEXT.md, Queued session). */
export const isOver = (r: Pick<SessionRecord, 'endedAt' | 'lastState'>) =>
  Boolean(r.endedAt) || FINAL_STATES.has(r.lastState.state);

/** The states that need a person (CONTEXT.md, Session state). */
export const WAITING_STATES: ReadonlySet<SessionState> = new Set([
  'waiting-permission',
  'waiting-question',
]);

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

/** A session with no live window: nothing to attach to or type into, only to resume. */
export const sessionEnded = () => new MesaError('not_found', 'session ended; use mesa resume');
