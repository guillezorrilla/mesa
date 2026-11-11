// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { appearanceConfig, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { GitTab } from './GitTab';

const checkout = { project: 'lantern-cove', path: '/h/src/lantern-cove', registered: true };

function setUp() {
  let changes = [
    { path: 'docs/changed.txt', index: ' ', workingTree: 'M' },
    { path: 'gull.md', index: '?', workingTree: '?' },
  ];
  const { bridge, calls } = fakeBridge({
    config: appearanceConfig({}),
    'git status': () => envelope({ checkout, branch: 'main', changes }),
    'git diff': () => envelope({ checkout, staged: false, path: '', patch: '', rows: [] }),
    'git discard': (args: string[]) => {
      const named = args.slice(args.indexOf('lantern-cove') + 1);
      const gone = args.includes('--all') ? changes : changes.filter((c) => named.includes(c.path));
      changes = changes.filter((change) => !gone.includes(change));
      return envelope({ checkout, discarded: gone, receipt: null });
    },
    'git branches': () => envelope({ checkout, branches: [], remotes: [] }),
    'worktrees list': () => envelope([]),
  });
  const discards = () => calls.filter((call) => call.includes('discard'));
  return { bridge, discards };
}
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (each) => each.textContent?.trim() === label || each.getAttribute('aria-label') === label,
  );
const listed = (byTestId: (id: string) => HTMLElement[]) =>
  [...(byTestId('git-discard-dialog')[0]?.querySelectorAll('li') ?? [])].map(
    (li) => li.textContent,
  );

test('Discard changes on a row asks first, Cancel changes nothing, and confirm discards that file', async () => {
  const { bridge, discards } = setUp();
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  await click(button('Discard changes docs/changed.txt'));
  expect(listed(byTestId)).toEqual(['docs/changed.txt']);
  expect(byTestId('git-discard-dialog')[0]?.textContent).toContain('untracked files are deleted');
  await click(button('Cancel'));
  expect(byTestId('git-discard-dialog')).toHaveLength(0);
  expect(discards()).toEqual([]);
  await click(button('Discard changes docs/changed.txt'));
  await click(byTestId('confirm-git-discard')[0]);
  expect(discards()).toEqual([
    ['--json', 'git', 'discard', '--yes', '--', 'lantern-cove', 'docs/changed.txt'],
  ]);
  expect(document.querySelector('[title="docs/changed.txt"]')).toBeNull();
  expect(document.querySelector('[title="gull.md"]')).not.toBeNull();
});

test('Discard all lists every file, marks untracked ones as deleted, and discards with --all', async () => {
  const { bridge, discards } = setUp();
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  await click(button('Discard all'));
  expect(listed(byTestId)).toEqual(['docs/changed.txt', 'gull.mdUntracked, deleted']);
  await click(byTestId('confirm-git-discard')[0]);
  expect(discards()).toEqual([
    ['--json', 'git', 'discard', '--all', '--yes', '--', 'lantern-cove'],
  ]);
  expect(document.body.textContent).toContain('Working tree clean.');
});

test('the right-click menu on a row offers Discard changes, which asks first', async () => {
  const { bridge, discards } = setUp();
  const byTestId = await renderWithMesa(<GitTab project="lantern-cove" />, bridge);
  const row = document.querySelector('[title="gull.md"]');
  await act(async () => {
    row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 }));
  });
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(
    (each) => each.textContent === 'Discard changes',
  );
  await click(item as HTMLElement);
  expect(listed(byTestId)).toEqual(['gull.mdUntracked, deleted']);
  expect(discards()).toEqual([]);
});
