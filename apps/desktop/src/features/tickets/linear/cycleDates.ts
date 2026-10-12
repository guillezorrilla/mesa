import type { LinearCycle } from '@mesa/core';

const day = (at: number) =>
  new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * A Linear cycle's first and last day, such as Oct 6 to Oct 19: it ends at the start of the day
 * after its last, so the last day is the one just before its end.
 */
export const cycleDates = (cycle: Pick<LinearCycle, 'startsAt' | 'endsAt'>) =>
  `${day(Date.parse(cycle.startsAt))} to ${day(Date.parse(cycle.endsAt) - 1)}`;
