// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, exited, fakeBridge, renderWithMesa } from '@/lib/testing';
import { RemoveDialog } from './RemoveDialog';

const worktree = { path: '/h/.mesa/default/worktrees/alpha/try-x', branch: 'try/x' };
const beta = { path: '/h/.mesa/default/worktrees/beta/try-x', branch: 'try/x' };
const row = {
  ...exited,
  project: 'alpha',
  worktree,
  additional: [{ project: 'beta', worktree: beta }],
} satisfies TreeRow;

test("Remove lists each additional project's worktree and branch, and removes them with the session's", async () => {
  const removed: { deleteWorktree: boolean; deleteBranch: boolean }[] = [];
  const byTestId = await renderWithMesa(
    <RemoveDialog
      row={row}
      disabled={false}
      onRemove={(opts) => removed.push(opts)}
      onCancel={() => {}}
    />,
    fakeBridge().bridge,
  );
  expect(byTestId('remove-additional-beta')[0]?.textContent).toBe(
    `beta: worktree ${beta.path}, branch try/x`,
  );
  await click(byTestId('remove-worktree')[0]);
  const listed = byTestId('remove-list')[0]?.textContent ?? '';
  expect(listed).toContain(`its worktree ${worktree.path}`);
  expect(listed).toContain(`beta's worktree ${beta.path}`);
  await click(byTestId('remove-confirm')[0]);
  expect(removed).toEqual([{ deleteWorktree: true, deleteBranch: false }]);
});

test('Remove offers no worktree a newer session took over, and says it stays', async () => {
  const removed: { deleteWorktree: boolean; deleteBranch: boolean }[] = [];
  const taken = {
    ...row,
    additional: [],
    takenOver: [{ project: 'alpha', worktree: worktree.path, holder: 'n3w3r000' }],
  } satisfies TreeRow;
  const byTestId = await renderWithMesa(
    <RemoveDialog
      row={taken}
      disabled={false}
      onRemove={(opts) => removed.push(opts)}
      onCancel={() => {}}
    />,
    fakeBridge().bridge,
  );
  expect(byTestId('remove-worktree')).toEqual([]);
  expect(byTestId('remove-kept')[0]?.textContent).toBe(
    `${worktree.path} stays, with its branch: a newer session uses it now.`,
  );
  expect(byTestId('remove-list')[0]?.textContent).not.toContain(worktree.path);
  await click(byTestId('remove-confirm')[0]);
  expect(removed).toEqual([{ deleteWorktree: false, deleteBranch: false }]);
});
