/**
 * How long, in seq units (microseconds of the sender's clock), a box may arrive after a later one
 * and still be taken: the relay and the direct path (#1129) can deliver two boxes out of order.
 */
export const REORDER_US = 10_000_000;

/**
 * The seqs one side took from the other: a box is taken once, and refused when it is at or under
 * the floor, which follows the newest seq taken less REORDER_US. After a restart the floor is the
 * last seq kept, so nothing older is taken again.
 */
export function takenSeqs(kept: number) {
  let floor = kept;
  let last = kept;
  const recent = new Set<number>();
  return {
    /** Nothing at or under this seq is taken; openMessage refuses it as replayed. */
    floor: () => floor,
    /** The newest seq taken, which the side keeps between runs. */
    last: () => last,
    /** Takes `seq`, or false when it was taken already. */
    take(seq: number): boolean {
      if (seq <= floor || recent.has(seq)) return false;
      recent.add(seq);
      last = Math.max(last, seq);
      if (last - REORDER_US > floor) {
        floor = last - REORDER_US;
        for (const old of recent) if (old <= floor) recent.delete(old);
      }
      return true;
    },
  };
}
