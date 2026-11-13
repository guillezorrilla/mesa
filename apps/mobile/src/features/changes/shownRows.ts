import type { DiffLine } from '@mesa/core/phone';

/** Git's file header lines, which the file's name over the diff already says. */
const HEADER =
  /^(diff --git |index |--- |\+\+\+ |(new|deleted) file mode |(old|new) mode |similarity |rename (from|to) )/;

/** The rows a phone shows: the hunks and their lines, and notes such as a binary file's, without Git's file header. */
export const shownRows = (rows: readonly DiffLine[]) =>
  rows.filter((row) => row.kind !== 'meta' || !HEADER.test(row.text));
