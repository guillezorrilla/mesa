// @vitest-environment happy-dom
import type { Config, TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, exited, fakeBridge, renderWithMesa } from '@/lib/testing';
import { DescendantDialog } from './DescendantDialog';
import { RemoveDialog } from './RemoveDialog';

const worktree = { path: '/h/.mesa/default/worktrees/lantern-cove/try-x', branch: 'try/x' };
const parent = { ...exited, worktree, children: ['dddddddd'] } satisfies TreeRow;
const child = { ...exited, id: 'dddddddd', parent: parent.id, depth: 1 } satisfies TreeRow;

/** A bridge whose profile config has `worktrees.deleteBranch` as given. */
async function withSetting(deleteBranch: boolean) {
  const config = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  return fakeBridge({
    config: () => envelope({ ...config, worktrees: { ...config.worktrees, deleteBranch } }),
    sessions: () => envelope([parent, child]),
  }).bridge;
}
const checked = (id: string) => document.getElementById(id)?.getAttribute('aria-checked');
const confirm = (testId: string) =>
  click(document.querySelector<HTMLElement>(`[data-testid="${testId}"]`) ?? undefined);

test.each([
  [true, 'true'],
  [false, 'false'],
])(
  'Remove starts "also delete its branch" as worktrees.deleteBranch %s says',
  async (setting, state) => {
    const removed: { deleteBranch: boolean }[] = [];
    await renderWithMesa(
      <RemoveDialog
        row={parent}
        disabled={false}
        onRemove={(opts) => removed.push(opts)}
        onCancel={() => {}}
      />,
      await withSetting(setting),
    );
    expect(checked('remove-branch')).toBe(state);
    await confirm('remove-confirm');
    expect(removed).toEqual([{ deleteWorktree: false, deleteBranch: setting }]);
  },
);

test('Remove with the setting on can still be unchecked, and then keeps the branch', async () => {
  const removed: { deleteBranch: boolean }[] = [];
  await renderWithMesa(
    <RemoveDialog
      row={parent}
      disabled={false}
      onRemove={(opts) => removed.push(opts)}
      onCancel={() => {}}
    />,
    await withSetting(true),
  );
  expect(document.querySelector('[data-testid="remove-list"]')?.textContent).toContain(
    'its branch try/x',
  );
  await click(document.getElementById('remove-branch') ?? undefined);
  expect(checked('remove-branch')).toBe('false');
  await confirm('remove-confirm');
  expect(removed).toEqual([{ deleteWorktree: false, deleteBranch: false }]);
});

test('Remove descendants starts "also delete their branches" checked with the setting on, and unchecks', async () => {
  const confirmed: { deleteBranch: boolean }[] = [];
  const render = async (setting: boolean) =>
    renderWithMesa(
      <DescendantDialog
        row={parent}
        action="remove"
        disabled={false}
        onConfirm={(_, options) => confirmed.push(options)}
        onCancel={() => {}}
      />,
      await withSetting(setting),
    );
  await render(false);
  expect(checked('descendant-branches')).toBe('false');
  await render(true);
  expect(checked('descendant-branches')).toBe('true');
  await confirm('descendant-confirm');
  await click(document.getElementById('descendant-branches') ?? undefined);
  expect(checked('descendant-branches')).toBe('false');
  await confirm('descendant-confirm');
  expect(confirmed).toEqual([
    { deleteWorktree: false, deleteBranch: true },
    { deleteWorktree: false, deleteBranch: false },
  ]);
});
