// The paired runs' order (ADR-0019): every arm runs every task the same number of times, in an
// order shuffled by a seed, so a run repeats for its seed and no arm gets the warmer machine.

/** A seeded generator (mulberry32), so the order and the dry run repeat for a seed. */
export function random(state) {
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Every `{arm, task, rep}` of `arms` x `tasks` x `reps`, shuffled by `seed`, and the generator
 * that shuffled it, which the dry run draws on next.
 */
export function runOrder({ arms, tasks, reps, seed }) {
  const draw = random(seed);
  const order = arms.flatMap((arm) =>
    tasks.flatMap((task) => Array.from({ length: reps }, (_, i) => ({ arm, task, rep: i + 1 }))),
  );
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(draw() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { order, draw };
}
