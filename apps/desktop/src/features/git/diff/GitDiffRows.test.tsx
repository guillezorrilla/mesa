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

test('lines a patch skips between its hunks show as a gap, never as touching rows', async () => {
  const context = (oldLine: number, newLine: number): DiffRow => ({
    kind: 'context',
    left: `o${oldLine}`,
    right: `o${oldLine}`,
    oldLine,
    newLine,
  });
  const hunks: DiffRow[] = [
    { kind: 'meta', left: '@@ -3,2 +3,3 @@', right: '@@ -3,2 +3,3 @@' },
    context(3, 3),
    { kind: 'change', left: '', right: 'added', newLine: 4 },
    context(4, 5),
    { kind: 'meta', left: '@@ -16,2 +17,2 @@', right: '@@ -16,2 +17,2 @@' },
    { kind: 'change', left: 'was', right: 'now', oldLine: 16, newLine: 17 },
    context(17, 18),
  ];
  for (const layout of ['side-by-side', 'inline'] as const) {
    await renderWithMesa(
      <GitDiffRows rows={hunks} layout={layout} fontSize={13} />,
      fakeBridge().bridge,
    );
    expect(
      [...document.querySelectorAll('p')].map((gap) => gap.textContent?.replace('...', '')),
    ).toEqual(['2 unchanged lines not in this diff', '11 unchanged lines not in this diff']);
  }
});
