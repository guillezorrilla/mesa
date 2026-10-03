// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { appearanceConfig, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { GitTab } from './GitTab';

const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };
const commit = {
  oid: 'b'.repeat(40),
  subject: 'Feature commit',
  author: 'Test',
  authoredAt: '2026-09-27T12:00:00Z',
  parents: ['a'.repeat(40)],
  refs: ['HEAD -> main', 'origin/main'],
};
const bridge = () =>
  fakeBridge({
    config: appearanceConfig({ diffFontSize: 17, fileTreeFontSize: 11 }),
    'git status': () =>
      envelope({
        checkout,
        branch: 'main',
        changes: [{ path: 'docs/changed.txt', index: ' ', workingTree: 'M' }],
      }),
    'git diff': () =>
      envelope({
        checkout,
        staged: false,
        path: 'docs/changed.txt',
        patch: '@@ -1 +1 @@\n-old\n+new\n',
        rows: [{ kind: 'change', left: 'old', right: 'new', oldLine: 1, newLine: 1 }],
      }),
    'git branches': () =>
      envelope({ checkout, branches: [{ name: 'main', oid: 'a', current: true }] }),
    'git graph': () => envelope({ checkout, rows: [{ graph: '* ', commit }], commits: 1 }),
    'git compare': () =>
      envelope({
        checkout,
        base: 'a'.repeat(40),
        head: commit.oid,
        behind: 0,
        ahead: 1,
        patch: 'diff --git a/src/feature.ts b/src/feature.ts\n@@ -0,0 +1 @@\n+feature\n',
        rows: [
          { kind: 'meta', left: 'diff --git a/src/feature.ts b/src/feature.ts', right: '' },
          { kind: 'meta', left: '@@ -0,0 +1 @@', right: '' },
          { kind: 'change', left: '', right: 'feature', newLine: 1 },
        ],
      }),
    'worktrees list': () => envelope([]),
  }).bridge;
const commitRow = () =>
  document.querySelector<HTMLButtonElement>('[aria-label="Commits"] button') ?? undefined;
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (each) => each.textContent === label || each.getAttribute('aria-label') === label,
  );

test('the diff, both layouts, and the change list use the profile diff and tree sizes', async () => {
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  expect(byTestId('git-side-diff')[0]?.style.fontSize).toBe('17px');
  await click(button('Inline diff'));
  expect(byTestId('git-inline-diff')[0]?.style.fontSize).toBe('17px');
  const row = document.querySelector<HTMLElement>('[title="docs/changed.txt"]');
  expect(row && getComputedStyle(row).fontSize).toBe('11px');
});

test('a graph commit opens its changed files and diff at the profile diff size', async () => {
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  await click(button('Graph'));
  expect(document.querySelector('[aria-label="Git graph"] svg circle')).not.toBeNull();
  expect(document.querySelector('[aria-label="Commits"]')?.textContent).toContain('origin/main');
  await click(commitRow());
  const panel = document.querySelector('[aria-label="Git comparison"]');
  expect(panel?.textContent).toContain('feature.ts');
  expect(panel?.textContent).toContain('1 file changed');
  expect(byTestId('git-side-diff')[0]?.style.fontSize).toBe('17px');
});

test('two refs compare from the graph toolbar', async () => {
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  await click(button('Graph'));
  await click(button('Compare refs'));
  const base = document.querySelector<HTMLInputElement>('[aria-label="Compare base"]');
  const head = document.querySelector<HTMLInputElement>('[aria-label="Compare head"]');
  await act(async () => {
    for (const [field, value] of [
      [base, 'main'],
      [head, commit.oid],
    ] as const) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
      field?.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await click(button('Compare'));
  const panel = document.querySelector('[aria-label="Git comparison"]');
  expect(panel?.textContent).toContain('0 behind, 1 ahead');
  expect(panel?.textContent).toContain('feature');
});
