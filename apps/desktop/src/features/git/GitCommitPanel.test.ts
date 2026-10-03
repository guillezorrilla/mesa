import { expect, test } from 'vitest';
import { patchFiles } from './GitCommitPanel';

test('a commit patch splits per file, quoted and spaced paths included', () => {
  const meta = (left: string) => ({ kind: 'meta' as const, left, right: '' });
  const change = { kind: 'change' as const, left: '', right: 'x', newLine: 1 };
  const files = patchFiles([
    meta('diff --git a/docs/tide notes.md b/docs/tide notes.md'),
    change,
    meta('diff --git "a/caf\\303\\251.md" "b/caf\\303\\251.md"'),
    change,
  ]);
  expect(files.map((file) => [file.path, file.rows.length])).toEqual([
    ['docs/tide notes.md', 1],
    ['caf\\303\\251.md', 1],
  ]);
});
