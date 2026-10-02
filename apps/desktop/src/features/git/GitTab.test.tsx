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
        patch: '+feature\n',
        rows: [{ kind: 'change', left: '', right: 'feature' }],
      }),
    'worktrees list': () => envelope([]),
  }).bridge;
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

test('the commit compare patch uses the profile diff size', async () => {
  await renderWithMesa(<GitTab project="lantern-cove" />, bridge());
  await click(button('Graph'));
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
  const patch = document.querySelector<HTMLElement>('[aria-label="Git comparison"] pre');
  expect(patch?.textContent).toBe('+feature\n');
  expect(patch?.style.fontSize).toBe('17px');
});
