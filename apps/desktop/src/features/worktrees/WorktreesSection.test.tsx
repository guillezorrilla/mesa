// @vitest-environment happy-dom
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { deferred, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { useCommand } from '@/lib/useCommand';
import { WorktreesSection } from './WorktreesSection';

const ROWS = [
  { path: '/h/src/lantern-cove', main: true, state: 'ready', branch: 'main', holders: [] },
  { path: '/h/w/harbour', main: false, state: 'ready', branch: 'harbour', holders: [] },
  {
    path: '/h/w/tide-sizes',
    main: false,
    state: 'ready',
    branch: 'tide-sizes',
    createdAt: '2026-11-10T11:00:00Z',
    holders: [],
  },
];
const SIZES: Record<string, number | null> = {
  '/h/src/lantern-cove': 2_000_000,
  '/h/w/harbour': null,
  '/h/w/tide-sizes': 12_300_000_000,
};

/** The section as the Overview mounts it: once the cards' list has loaded. */
function Section() {
  const worktrees = useCommand('worktrees.list', { project: 'lantern-cove' });
  return worktrees.data ? (
    <WorktreesSection
      project="lantern-cove"
      exists
      worktrees={worktrees}
      onSession={() => {}}
      onNewSession={() => {}}
      onNewWorktree={() => {}}
    />
  ) : null;
}

const cardNames = () =>
  [...document.querySelectorAll('[data-testid="worktree-card"] .font-mono[title]')].map(
    (name) => name.textContent,
  );
const sortMenu = () => document.querySelector<HTMLSelectElement>('[aria-label="Sort worktrees"]');

beforeEach(() => localStorage.clear());

test('the cards show first, then each size and the total; sorting by size puts the largest first and is kept per profile', async () => {
  const sized = deferred();
  const { bridge, calls } = fakeBridge({
    profile: () => envelope({ profile: 'work' }),
    'worktrees list': (args) => (args.includes('--sizes') ? sized.promise : envelope(ROWS)),
  });
  await renderWithMesa(<Section />, bridge);
  expect(cardNames()).toEqual(['main', 'harbour', 'tide-sizes']);
  expect(document.body.textContent).toContain('Worktrees (3)');
  expect(document.querySelector('[data-testid="worktree-size"]')).toBeNull();
  expect(calls).toContainEqual(['--json', 'worktrees', 'list', '--sizes', '--', 'lantern-cove']);

  await act(async () =>
    sized.resolve(
      envelope(ROWS.map((row) => ({ ...row, sizeBytes: SIZES[row.path], sizeAt: 'x' }))),
    ),
  );
  expect(document.body.textContent).toContain('Worktrees (3, 12.3 GB)');
  expect(
    [...document.querySelectorAll('[data-testid="worktree-size"]')].map((size) => size.textContent),
  ).toEqual(['2.0 MB', '12.3 GB']);

  const menu = sortMenu();
  await act(async () => {
    if (menu) menu.value = 'size';
    menu?.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(cardNames()).toEqual(['tide-sizes', 'main', 'harbour']);
  expect(localStorage.getItem('mesa.worktrees.sort.work')).toBe('size');
});

test('a kept sort applies on the next visit, and only in its own profile', async () => {
  localStorage.setItem('mesa.worktrees.sort.work', 'created');
  localStorage.setItem('mesa.worktrees.sort.home', 'size');
  const { bridge } = fakeBridge({
    profile: () => envelope({ profile: 'work' }),
    'worktrees list': () => envelope(ROWS),
  });
  await renderWithMesa(<Section />, bridge);
  expect(sortMenu()?.value).toBe('created');
  expect(cardNames()).toEqual(['tide-sizes', 'main', 'harbour']);
});
