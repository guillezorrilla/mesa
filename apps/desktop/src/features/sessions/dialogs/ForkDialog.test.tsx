// @vitest-environment happy-dom
import type { ManagedRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { exited, fakeBridge, renderWithMesa } from '@/lib/testing';
import { ForkDialog } from './ForkDialog';

const worktree = { path: '/h/.mesa/default/worktrees/alpha/source', branch: 'source' };
const render = (row: ManagedRow) =>
  renderWithMesa(
    <ForkDialog row={row} disabled={false} onFork={() => {}} onCancel={() => {}} />,
    fakeBridge().bridge,
  );

test('Fork of a session across projects requires a branch and says every project gets a worktree', async () => {
  const beta = { path: '/h/.mesa/default/worktrees/beta/source', branch: 'source' };
  const byTestId = await render({
    ...exited,
    project: 'alpha',
    worktree,
    additional: [{ project: 'beta', worktree: beta }],
  });
  const branch = byTestId('fork-branch')[0] as HTMLInputElement;
  expect(branch.required).toBe(true);
  const hint = document.getElementById(branch.getAttribute('aria-describedby') ?? '');
  expect(hint?.textContent).toBe('Every project gets a worktree on this branch');
});

test('Fork of a session in one project has no such hint', async () => {
  const byTestId = await render({ ...exited, worktree });
  expect(byTestId('fork-branch')[0]?.getAttribute('aria-describedby')).toBeNull();
  expect(document.getElementById('fork-branch-hint')).toBeNull();
});
