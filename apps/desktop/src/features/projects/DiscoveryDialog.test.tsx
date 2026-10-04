// @vitest-environment happy-dom
import type { NativeDiscovery } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { click, deferred, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { DiscoveryDialog } from './DiscoveryDialog';

const FOUND: NativeDiscovery = {
  since: '2026-08-25T12:00:00.000Z',
  days: 30,
  projects: [
    {
      path: '/src/tide-pool',
      name: 'tide-pool',
      configured: false,
      registered: false,
      conversations: 12,
      live: 1,
    },
    {
      path: '/src/harbor',
      name: 'harbor',
      configured: false,
      registered: false,
      conversations: 3,
      live: 0,
    },
    {
      path: '/src/lantern-cove',
      name: 'lantern-cove',
      configured: true,
      registered: true,
      conversations: 1,
      live: 0,
    },
  ],
  live: [
    {
      agent: 'claude',
      id: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f',
      cwd: '/src/tide-pool',
      project: '/src/tide-pool',
      name: 'Tide tables',
      status: 'busy',
    },
    {
      agent: 'codex',
      id: '01a0e14e-be41-72f1-a81b-e25d2198602a',
      cwd: '/src/tide-pool/docs',
      project: '/src/tide-pool',
    },
  ],
  conversations: [],
  total: 16,
  unplaced: 0,
  truncated: false,
  unsupported: [{ agent: 'antigravity', reason: 'No qualified native CLI history source' }],
};

/** The dialog over `found`, its `discover adopt` replies from `adopt`; config sets echo. */
async function open(
  adopt: (args: string[]) => unknown = (args) => envelope(adoption(args)),
  found: NativeDiscovery = FOUND,
) {
  const onCancel = vi.fn();
  const onRegistered = vi.fn(async () => {});
  const { bridge, calls } = fakeBridge({
    discover: () => envelope(found),
    'discover adopt': adopt,
    'config set': (args) => envelope({ path: args.at(-2), value: JSON.parse(args.at(-1) ?? '') }),
  });
  const byTestId = await renderWithMesa(
    <DiscoveryDialog onCancel={onCancel} onRegistered={onRegistered} />,
    bridge,
  );
  return { byTestId, calls, onCancel, onRegistered };
}

/** `discover adopt`'s reply for the folder its args name: registered, one session adopted. */
const adoption = (args: string[]) => ({
  project: args.at(-1)?.split('/').at(-1),
  registered: true,
  adopted: [{ id: 'aaaaaaaa', agentSessionId: 'x', agent: 'claude' }],
  reopened: [],
  failed: [],
  receipt: null,
});
const discovery = (value: string) => [
  '--json',
  'config',
  'set',
  '--',
  'onboarding.discovery',
  JSON.stringify(value),
];
const adopts = (calls: string[][]) => calls.filter((args) => args[2] === 'adopt');
const checked = (el: HTMLElement | undefined) => el?.getAttribute('aria-checked') === 'true';

test('Find from sessions ticks each unregistered folder and no running session', async () => {
  const { byTestId, calls } = await open();
  expect(calls).toEqual([['--json', 'discover']]);
  const rows = byTestId('discovered-project');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining('12 conversations, 1 running'),
    expect.stringContaining('3 conversations'),
    expect.stringContaining('Registered'),
  ]);
  expect(byTestId('discovery-tick').map(checked)).toEqual([true, true]);
  expect(rows[2]?.querySelector('[data-testid="discovery-tick"]')).toBeNull();
  expect(byTestId('discovery-dialog')[0]?.textContent).toContain(
    'end the session in its original terminal first: both hold the same transcript',
  );
  const live = byTestId('discovery-live')[0]?.querySelectorAll('li') ?? [];
  expect([...live].map((li) => li.textContent)).toEqual([
    'Tide tablesclaude/src/tide-pool',
    '01a0e14e-be41-72f1-a81b-e25d2198602acodex/src/tide-pool/docs',
  ]);
  expect(byTestId('discovery-live-tick').map(checked)).toEqual([false, false]);
  expect(byTestId('discovery-total')[0]?.textContent).toBe('16 conversations in the last 30 days.');

  await click(byTestId('discovery-tick')[0]);
  await click(byTestId('discovery-tick')[1]);
  expect(byTestId('discovery-add')[0]?.hasAttribute('disabled')).toBe(true);
});

test('a folder with an error is shown unticked, as it is never added', async () => {
  const reef = {
    path: '/src/reef',
    name: 'reef',
    configured: true,
    registered: false,
    error: 'mesa.yaml: name is missing',
    conversations: 2,
    live: 0,
  };
  const { byTestId } = await open(undefined, { ...FOUND, projects: [reef] });
  expect(byTestId('discovery-tick').map(checked)).toEqual([false]);
  expect(byTestId('discovery-add')[0]?.hasAttribute('disabled')).toBe(true);
});

test('Add to Mesa writes started, adopts each ticked folder with progress, then complete and the summary', async () => {
  const replies = [deferred(), deferred()];
  const { byTestId, calls, onCancel, onRegistered } = await open(
    () => replies[adopts(calls).length - 1]?.promise,
  );
  await click(byTestId('discovery-live-tick')[0]);
  // Both run in tide-pool: --live reopens them together.
  expect(byTestId('discovery-live-tick').map(checked)).toEqual([true, true]);
  await click(byTestId('discovery-add')[0]);
  expect(calls.slice(1)).toEqual([
    discovery('started'),
    ['--json', 'discover', 'adopt', '--live', '--', '/src/tide-pool'],
  ]);
  expect(byTestId('discovery-progress')[0]?.textContent).toBe('Adding tide-pool (1 of 2)');
  await act(async () => replies[0]?.resolve(envelope(adoption(['/src/tide-pool']))));
  expect(byTestId('discovery-progress')[0]?.textContent).toBe('Adding harbor (2 of 2)');
  expect(adopts(calls).at(-1)).toEqual(['--json', 'discover', 'adopt', '--', '/src/harbor']);
  await act(async () =>
    replies[1]?.resolve(
      envelope({
        ...adoption(['/src/harbor']),
        failed: [{ agentSessionId: 'bbbbbbbb-0000', reason: 'transcript unreadable' }],
      }),
    ),
  );
  expect(calls.at(-1)).toEqual(discovery('complete'));
  expect(onRegistered).toHaveBeenCalledOnce();
  expect(byTestId('discovery-summary')[0]?.textContent).toBe(
    '2 projects registered, 2 sessions adopted.bbbbbbbb-0000: transcript unreadable',
  );
  await click(byTestId('discovery-done')[0]);
  expect(onCancel).toHaveBeenCalledOnce();
});

test('Skip writes dismissed and closes', async () => {
  const { byTestId, calls, onCancel } = await open();
  await click(byTestId('discovery-skip')[0]);
  expect(calls.slice(1)).toEqual([discovery('dismissed')]);
  expect(onCancel).toHaveBeenCalledOnce();
});

test('Skip during a run stops after the current folder, then writes dismissed and closes', async () => {
  const reply = deferred();
  const { byTestId, calls, onCancel } = await open(() => reply.promise);
  await click(byTestId('discovery-add')[0]);
  await click(byTestId('discovery-skip')[0]);
  expect(onCancel).not.toHaveBeenCalled();
  await act(async () => reply.resolve(envelope(adoption(['/src/tide-pool']))));
  expect(adopts(calls)).toHaveLength(1);
  expect(calls.slice(1)).toEqual([
    discovery('started'),
    ['--json', 'discover', 'adopt', '--', '/src/tide-pool'],
    discovery('dismissed'),
  ]);
  expect(onCancel).toHaveBeenCalledOnce();
});

test('Escape during a run keeps the dialog open and writes no config', async () => {
  const reply = deferred();
  const { byTestId, calls, onCancel } = await open(() => reply.promise);
  await click(byTestId('discovery-add')[0]);
  await act(async () => {
    byTestId('discovery-dialog')[0]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
  expect(onCancel).not.toHaveBeenCalled();
  expect(byTestId('discovery-progress')).toHaveLength(1);
  expect(calls.slice(1)).toEqual([
    discovery('started'),
    ['--json', 'discover', 'adopt', '--', '/src/tide-pool'],
  ]);
});
