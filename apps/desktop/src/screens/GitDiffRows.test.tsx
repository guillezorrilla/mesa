// @vitest-environment happy-dom
import type { DiffRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, fakeBridge, renderWithMesa } from '@/lib/testing';
import { GitDiffRows } from './GitDiffRows';

// A 20-line file whose line 10 changed, as `git diff --full` numbers it.
const rows: DiffRow[] = [
  { kind: 'meta', left: '@@ -1,20 +1,20 @@', right: '@@ -1,20 +1,20 @@' },
  ...Array.from(
    { length: 20 },
    (_, i): DiffRow =>
      i === 9
        ? { kind: 'change', left: 'old', right: 'new', oldLine: 10, newLine: 10 }
        : {
            kind: 'context',
            left: `l${i + 1}`,
            right: `l${i + 1}`,
            oldLine: i + 1,
            newLine: i + 1,
          },
  ),
];
const folds = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].map((button) => button.textContent);

test('unchanged runs beyond three lines of a change fold, and a fold opens in place', async () => {
  const byTestId = await renderWithMesa(
    <GitDiffRows rows={rows} layout="side-by-side" fontSize={13} />,
    fakeBridge().bridge,
  );
  expect(folds()).toEqual(['6 unmodified lines', '7 unmodified lines']);
  const text = () => byTestId('git-side-diff')[0]?.textContent ?? '';
  expect(text()).toContain('7l77l7');
  expect(text()).toContain('10old10new');
  expect(text()).not.toContain('l6');
  await click([...document.querySelectorAll<HTMLButtonElement>('button')][0]);
  expect(folds()).toEqual(['7 unmodified lines']);
  expect(text()).toContain('1l11l1');
});

test('inline reads a change block as all removed lines, then all added ones', async () => {
  const block: DiffRow[] = [
    { kind: 'change', left: 'a', right: 'x', oldLine: 1, newLine: 1 },
    { kind: 'change', left: 'b', right: '', oldLine: 2 },
  ];
  const byTestId = await renderWithMesa(
    <GitDiffRows rows={block} layout="inline" fontSize={13} />,
    fakeBridge().bridge,
  );
  expect(byTestId('git-inline-diff')[0]?.textContent).toBe('1-a2-b1+x');
});
