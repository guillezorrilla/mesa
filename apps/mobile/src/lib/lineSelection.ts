/** A run of lines chosen by tapping: from `start` to `end`, both included. */
export type LineSelection = { start: number; end: number };

/**
 * The selection after a tap on line `at`: a first tap picks that line, a second tap on another
 * line stretches to it, and a tap after a stretch, or on the one picked line, starts over.
 */
export function tapLine(
  selection: LineSelection | undefined,
  at: number,
): LineSelection | undefined {
  if (!selection || selection.start !== selection.end) return { start: at, end: at };
  if (selection.start === at) return undefined;
  return { start: Math.min(selection.start, at), end: Math.max(selection.start, at) };
}

/** Whether line `at` is in `selection`. */
export const isSelected = (selection: LineSelection | undefined, at: number) =>
  selection !== undefined && at >= selection.start && at <= selection.end;
