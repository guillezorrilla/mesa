import { AGENT_STATES } from '../../agents/states.js';

// A session's states and the sets the rules read (CONTEXT.md, Session state). Its one import is
// as pure as it is, so the app can bundle them (@mesa/core/browser).

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

/** States a session does not leave on its own; distinct from ended (stopped, with `endedAt`). */
export const FINAL_STATES: ReadonlySet<SessionState> = new Set(['done', 'failed', 'stopped']);

/** The states that need a person (CONTEXT.md, Session state). */
export const WAITING_STATES: ReadonlySet<SessionState> = new Set([
  'waiting-permission',
  'waiting-question',
]);
