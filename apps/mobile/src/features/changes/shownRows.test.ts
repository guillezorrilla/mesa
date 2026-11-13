import { DIFF_START, diffLines } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { shownRows } from './shownRows';

test("a diff shows its hunks and a binary file's note, not Git's file header", () => {
  const { rows } = diffLines(
    [
      'diff --git a/tide.ts b/tide.ts',
      'index 1111111..2222222 100644',
      '--- a/tide.ts',
      '+++ b/tide.ts',
      '@@ -1 +1 @@',
      '--- a removed SQL comment',
      'diff --git a/logo.png b/logo.png',
      'new file mode 100644',
      'Binary files /dev/null and b/logo.png differ',
    ],
    DIFF_START,
  );
  expect(shownRows(rows).map((row) => row.text)).toEqual([
    '@@ -1 +1 @@',
    '-- a removed SQL comment',
    'Binary files /dev/null and b/logo.png differ',
  ]);
});
