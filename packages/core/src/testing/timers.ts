/**
 * Waits a test moves by hand: `wait` resolves once `pass` moved `now` past its end; `now` is the
 * same time in milliseconds, for code that reads a clock beside its waits.
 */
export function manualTimers(start = 0) {
  let now = start;
  const waits: { at: number; done: () => void }[] = [];
  return {
    now: () => now,
    wait: (ms: number) =>
      new Promise<void>((done) => {
        waits.push({ at: now + ms, done });
      }),
    /** Moves time on `ms`, settling every wait due, then lets their callbacks run. */
    pass: async (ms: number) => {
      now += ms;
      for (const due of waits.filter((wait) => wait.at <= now)) {
        waits.splice(waits.indexOf(due), 1);
        due.done();
      }
      for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
    },
  };
}
