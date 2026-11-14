import type { HunkPick } from '@mesa/core';
import { hunkRange } from '@mesa/core/browser';

type Numbered = { oldLine?: number; newLine?: number };

/**
 * Where each run of shown lines starts, by its piece's place, with the hunk it is in Git's diff:
 * a run is the lines near a change between two folds or gaps, which Git's three lines of context
 * make one hunk, so the runs count Git's hunks in order. Its range lets core refuse a hunk that
 * changed since it was shown.
 */
export function hunkStarts(pieces: readonly object[]): Map<number, Required<HunkPick>> {
  const starts = new Map<number, Required<HunkPick>>();
  let run: Numbered[] = [];
  let at = 0;
  const close = () => {
    if (!run.length) return;
    const side = (key: keyof Numbered) =>
      run
        .flatMap((line) => {
          const n = line[key];
          return n === undefined ? [] : [n];
        })
        .sort((a, b) => a - b);
    starts.set(at, { index: starts.size, expect: hunkRange(side('oldLine'), side('newLine')) });
    run = [];
  };
  pieces.forEach((piece, i) => {
    if (!('line' in piece)) close();
    else {
      if (!run.length) at = i;
      run.push(piece.line as Numbered);
    }
  });
  close();
  return starts;
}
