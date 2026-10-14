import type { Clock } from '../lib/clock.js';

export const fixedClock =
  (iso = '2026-09-24T12:00:00.000Z'): Clock =>
  () =>
    new Date(iso);

/** A clock that moves `stepMs` forward on every read: for timeouts and before/after stamps. */
export function steppingClock(iso = '2026-09-24T12:00:00.000Z', stepMs = 1000): Clock {
  let now = new Date(iso).getTime();
  return () => {
    const date = new Date(now);
    now += stepMs;
    return date;
  };
}

/** A clock a test moves by hand: `set` to a time, or `pass` some milliseconds. */
export function movableClock(iso = '2026-09-24T12:00:00.000Z') {
  let now = Date.parse(iso);
  const clock: Clock = () => new Date(now);
  return {
    clock,
    set: (next: string) => {
      now = Date.parse(next);
    },
    pass: (ms: number) => {
      now += ms;
    },
  };
}
