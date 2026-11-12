import { expect, test } from 'vitest';
import { DIFF_START, diffLines, noteLines } from './diff-lines.js';

const patch = [
  'diff --git a/tide.ts b/tide.ts',
  '--- a/tide.ts',
  '+++ b/tide.ts',
  '@@ -7,3 +7,3 @@ export function tide()',
  ' keep',
  '-gone',
  '--- a removed SQL comment',
  '+added',
  '\\ No newline at end of file',
];

test('a page is numbered on each side, signs cut, headers and hunk lines kept whole', () => {
  expect(diffLines(patch, DIFF_START).rows).toEqual([
    { kind: 'meta', text: 'diff --git a/tide.ts b/tide.ts' },
    { kind: 'meta', text: '--- a/tide.ts' },
    { kind: 'meta', text: '+++ b/tide.ts' },
    { kind: 'hunk', text: '@@ -7,3 +7,3 @@ export function tide()' },
    { kind: 'context', text: 'keep', old: 7, new: 7 },
    { kind: 'del', text: 'gone', old: 8 },
    { kind: 'del', text: '-- a removed SQL comment', old: 9 },
    { kind: 'add', text: 'added', new: 8 },
    { kind: 'meta', text: '\\ No newline at end of file' },
  ]);
});

test('pages read one after another number their lines as the whole read does', () => {
  const whole = diffLines(patch, DIFF_START).rows;
  const first = diffLines(patch.slice(0, 5), DIFF_START);
  const second = diffLines(patch.slice(5), first.next);
  expect([...first.rows, ...second.rows]).toEqual(whole);
  expect(first.next).toEqual({ old: 8, new: 8, inHunk: true });
});

test("a note covers the selection's new lines, or the one beside removed lines", () => {
  const rows = diffLines(patch, DIFF_START).rows;
  expect(noteLines(rows, 4, 7)).toEqual({ line: 7, end: 8 });
  // Removed lines alone: the new line before them, else the one after, else the whole file.
  expect(noteLines(rows, 5, 6)).toEqual({ line: 7, end: 7 });
  expect(noteLines(rows.slice(5), 0, 1)).toEqual({ line: 8, end: 8 });
  expect(noteLines(rows.slice(0, 4), 0, 3)).toEqual({ line: 0, end: 0 });
});
