// One file's unified diff, read a page at a time (ADR-0027, the request layer): the Mac sends a
// file's patch lines in pages with the line numbers where each page starts, and the phone numbers
// and colours them. Both sides read lines here, so a page starts where the last one ended.

/** One line of a file's patch: `text` without its +, - or space sign, numbered on each side it is on. */
export type DiffLine = {
  kind: 'meta' | 'hunk' | 'context' | 'add' | 'del';
  text: string;
  /** The line's number in the old file, for context and removed lines. */
  old?: number;
  /** The line's number in the new file, for context and added lines. */
  new?: number;
};

/** Where a page starts: the next old and new line numbers, and whether it is inside a hunk. */
export type DiffAt = { old: number; new: number; inHunk: boolean };

export const DIFF_START: DiffAt = { old: 0, new: 0, inHunk: false };

const SIGNS = { '+': 'add', '-': 'del', ' ': 'context' } as const;

/** Reads `lines` of a file's patch from `at`, and where the page after them starts. */
export function diffLines(
  lines: readonly string[],
  at: DiffAt,
): { rows: DiffLine[]; next: DiffAt } {
  let { old, new: next, inHunk } = at;
  const rows = lines.map((line): DiffLine => {
    const kind = inHunk ? SIGNS[line[0] as keyof typeof SIGNS] : undefined;
    if (kind === 'add') return { kind, text: line.slice(1), new: next++ };
    if (kind === 'del') return { kind, text: line.slice(1), old: old++ };
    if (kind === 'context') return { kind, text: line.slice(1), old: old++, new: next++ };
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (hunk) {
      inHunk = true;
      old = Number(hunk[1]);
      next = Number(hunk[2]);
      return { kind: 'hunk', text: line };
    }
    // `\ No newline at end of file` stays in the hunk; a new file's header ends it.
    if (line.startsWith('diff ')) inHunk = false;
    return { kind: 'meta', text: line };
  });
  return { rows, next: { old, new: next, inHunk } };
}

/**
 * The new-side lines a note on `rows` covers, as `review notes add` takes them: from the first to
 * the last new line among them, or 0 (the whole file) when they hold only removed lines or headers.
 */
export function noteLines(rows: readonly DiffLine[]): { line: number; end: number } {
  const numbers = rows.flatMap((row) => (row.new === undefined ? [] : [row.new]));
  if (!numbers.length) return { line: 0, end: 0 };
  return { line: Math.min(...numbers), end: Math.max(...numbers) };
}
