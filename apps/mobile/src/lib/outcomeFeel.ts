import type { Feel } from './hapticPlayer';

/** What held a call back: the guardrail's ask or block, or a prompt answered after it changed. */
const HELD = new Set(['ask', 'blocked', 'stale']);

/**
 * How a Mac call's answer feels: a warning when it was held back (HELD, or a merge that conflicts
 * or a failed check stopped), success when it landed (sent, queued, answered, started, merged). A
 * call that failed plays 'error' where it is caught.
 */
export const outcomeFeel = (answer: { status?: string; merged?: boolean }): Feel =>
  answer.merged === false || HELD.has(answer.status ?? '') ? 'warning' : 'success';
