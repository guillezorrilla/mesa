// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { WorktreesWorkspace } from './WorktreesWorkspace';

test('worktree filters and holder navigation use the public CLI bridge', async () => {
  const opened: string[] = [];
  const { bridge, calls } = fakeBridge({
    'worktrees list': () =>
      envelope([
        { path: '/tmp/repo', branch: 'main', main: true, state: 'ready', holders: [] },
        {
          path: '/tmp/feature',
          branch: 'feature',
          main: false,
          state: 'locked',
          holders: [{ id: 'aaaaaaaa', name: 'Review', state: 'idle', at: '2026-09-27T00:00:00Z' }],
        },
      ]),
  });
  const byTestId = await renderWithMesa(
    <WorktreesWorkspace project="lantern-cove" onSession={(id) => opened.push(id)} />,
    bridge,
  );
  expect(calls.some((args) => args[1] === 'worktrees' && args[2] === 'list')).toBe(true);
  await choose(
    document.querySelector('[aria-label="Filter worktree state"]') as HTMLElement,
    'locked',
  );
  expect(document.querySelectorAll('article')).toHaveLength(1);
  await click([...document.querySelectorAll<HTMLButtonElement>('article button')][0]);
  expect(opened).toEqual(['aaaaaaaa']);
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('[aria-label="Filter worktree branch"]');
    if (input) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'missing',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  expect(byTestId('worktrees-workspace')).toHaveLength(1);
  expect(document.querySelectorAll('article')).toHaveLength(0);
});

test('worktree settings and manual creation call the same profile CLI surface', async () => {
  const { bridge, calls } = fakeBridge({
    'worktrees list': () => envelope([]),
    'config set': () => envelope({ path: 'worktrees', value: {}, receipt: null }),
    'worktrees create': () =>
      envelope({ path: '/tmp/feature', branch: 'feature', base: 'main', receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <WorktreesWorkspace project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(document.querySelector('summary') ?? undefined);
  await choose(document.querySelector('#worktree-location') as HTMLElement, 'sibling');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Save settings',
    ),
  );
  const saved = calls.find(
    (args) => args[1] === 'config' && args[2] === 'set' && args.includes('worktrees'),
  );
  expect(saved && JSON.parse(saved.at(-1) ?? '{}').location).toBe('sibling');

  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('New worktree'),
    ),
  );
  expect(byTestId('worktree-create-dialog')).toHaveLength(1);
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('#new-worktree-branch');
    if (input) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        'feature',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await click(byTestId('confirm-worktree-create')[0]);
  expect(
    calls.some(
      (args) => args[1] === 'worktrees' && args[2] === 'create' && args.includes('feature'),
    ),
  ).toBe(true);
  expect(byTestId('worktree-create-dialog')).toHaveLength(0);
});

test('rerun setup targets the ready linked checkout through the CLI bridge', async () => {
  const { bridge, calls } = fakeBridge({
    config: () =>
      envelope({
        worktrees: {
          location: 'profile',
          fetch: false,
          sparseDirectories: [],
          carryIgnoredDirectories: [],
          setup: ['/usr/bin/touch', 'ready'],
          teardown: [],
        },
      }),
    'worktrees list': () =>
      envelope([
        { path: '/tmp/repo', branch: 'main', main: true, state: 'ready', holders: [] },
        { path: '/tmp/feature', branch: 'feature', main: false, state: 'ready', holders: [] },
      ]),
    'worktrees rerun': () => envelope({ path: '/tmp/feature', ran: true, receipt: null }),
  });
  await renderWithMesa(<WorktreesWorkspace project="lantern-cove" onSession={() => {}} />, bridge);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Rerun setup'),
    ),
  );
  expect(calls).toContainEqual([
    '--json',
    'worktrees',
    'rerun',
    '--',
    'lantern-cove',
    '/tmp/feature',
  ]);
});

test('recycle previews exact path, cancellation is read-only, and confirmation sends its token', async () => {
  const { bridge, calls } = fakeBridge({
    'worktrees list': () =>
      envelope([
        { path: '/tmp/feature', branch: 'feature', main: false, state: 'ready', holders: [] },
      ]),
    'worktrees preview': () =>
      envelope({
        action: 'recycle',
        project: 'lantern-cove',
        token: 'preview-token',
        paths: ['/tmp/feature'],
        branch: 'feature',
        head: 'abc123',
        state: 'ready',
        holders: [],
        changes: ['?? draft.txt'],
        ignored: [],
        unpublished: true,
        destination: '/tmp/recycle/feature',
        allowed: true,
        reasons: [],
      }),
    'worktrees apply': () =>
      envelope({
        action: 'recycle',
        paths: ['/tmp/feature'],
        destination: '/tmp/recycle/feature',
        receipt: null,
      }),
  });
  const byTestId = await renderWithMesa(
    <WorktreesWorkspace project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const recycle = () =>
    [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === 'Recycle',
    );
  await click(recycle());
  expect(byTestId('worktree-action-dialog')[0]?.textContent).toContain('/tmp/recycle/feature');
  await click(
    [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-testid="worktree-action-dialog"] button',
      ),
    ].find((button) => button.textContent === 'Cancel'),
  );
  expect(calls.some((args) => args[2] === 'apply')).toBe(false);
  await click(recycle());
  await click(byTestId('confirm-worktree-action')[0]);
  expect(calls).toContainEqual([
    '--json',
    'worktrees',
    'apply',
    '--action',
    'recycle',
    '--token',
    'preview-token',
    '--',
    'lantern-cove',
    '/tmp/feature',
  ]);
});
