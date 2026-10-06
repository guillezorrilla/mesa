// The states an agent reports, read from its hooks, screen, and listing. No imports, so the app
// can bundle them (@mesa/core/browser); sessions/record/states.ts adds Mesa's own.

/** Where a session's agent is: what Faro reads from its signals (CONTEXT.md, Session state). */
export const AGENT_STATES = [
  'working',
  'waiting-permission',
  'waiting-question',
  'idle',
  'done',
  'failed',
] as const;
export type AgentState = (typeof AGENT_STATES)[number];
