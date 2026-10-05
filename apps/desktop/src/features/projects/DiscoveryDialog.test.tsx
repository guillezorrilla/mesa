// @vitest-environment happy-dom
import type { NativeDiscovery } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import {
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  renderWithMesa,
  toasts,
} from '@/lib/testing';
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

/** A running session in each case: a registered folder, none, one with an error, one to tick. */
const CANNOT_TICK: NativeDiscovery = {
  ...FOUND,
  projects: [
    { ...FOUND.projects[2], conversations: 0, live: 1 },
    {
      path: '/src/reef',
      name: 'reef',
      configured: true,
      registered: false,
      error: 'mesa.yaml: name is missing',
      conversations: 0,
      live: 1,
    },
    { ...FOUND.projects[1], live: 1 },
  ] as NativeDiscovery['projects'],
  live: [
    {
      agent: 'claude',
      id: '7c2d3e4f-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
      cwd: '/src/lantern-cove',
      project: '/src/lantern-cove',
      name: 'Lamp wicks',
    },
    { agent: 'codex', id: '01a0e14e-be41-72f1-a81b-e25d21986099', cwd: '/tmp', project: null },
    {
      agent: 'claude',
      id: '3e4f5a6b-2c3d-4e5f-8a9b-1c2d3e4f5a6b',
      cwd: '/src/reef',
      project: '/src/reef',
    },
    {
      agent: 'claude',
      id: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f',
      cwd: '/src/harbor',
      project: '/src/harbor',
    },
  ],
};

/** `mesa adopt`'s reply: the running session adopted and reopened, with the adoption warning. */
const ADOPTED = {
  id: 'c0ffee12',
  warning: 'end the session in its original terminal first: both hold the same transcript',
};

/**
 * The dialog over `found`, its `discover adopt` replies from `adopt` and its `adopt` replies from
 * `adoptOne`; config sets echo.
 */
async function open(
  adopt: (args: string[]) => unknown = (args) => envelope(adoption(args)),
  found: NativeDiscovery = FOUND,
  adoptOne: (args: string[]) => unknown = () => envelope(ADOPTED),
) {
  const onCancel = vi.fn();
  const onRegistered = vi.fn(async () => {});
  const { bridge, calls } = fakeBridge({
    discover: () => envelope(found),
    'discover adopt': adopt,
    adopt: adoptOne,
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

/** The scan's conversations: two in tide-pool, one in harbor, one registered, one in no folder. */
const conversation = (id: string, project: string | null) => ({
  agent: 'claude' as const,
  id,
  cwd: project ?? '/tmp/loose',
  project,
  updatedAt: '2026-09-23T10:00:00.000Z',
});
const CONVERSATIONS = [
  conversation('aaaaaaaa-0001', '/src/tide-pool'),
  conversation('aaaaaaaa-0002', '/src/harbor'),
  conversation('aaaaaaaa-0003', '/src/lantern-cove'),
  conversation('aaaaaaaa-0004', '/src/tide-pool'),
  conversation('aaaaaaaa-0005', null),
];

test('Add to Mesa writes started, adopts each ticked folder with progress, then complete and the summary', async () => {
  const replies = [deferred(), deferred()];
  const { byTestId, calls, onCancel, onRegistered } = await open(
    () => replies[adopts(calls).length - 1]?.promise,
    { ...FOUND, conversations: CONVERSATIONS },
  );
  await click(byTestId('discovery-live-tick')[0]);
  // Both run in tide-pool: --live reopens them together.
  expect(byTestId('discovery-live-tick').map(checked)).toEqual([true, true]);
  await click(byTestId('discovery-add')[0]);
  expect(calls.slice(1)).toEqual([
    discovery('started'),
    [
      '--json',
      'discover',
      'adopt',
      '--live',
      '--ids',
      'aaaaaaaa-0001,aaaaaaaa-0004',
      '--',
      '/src/tide-pool',
    ],
  ]);
  expect(byTestId('discovery-progress')[0]?.textContent).toBe('Adding tide-pool (1 of 2)');
  await act(async () => replies[0]?.resolve(envelope(adoption(['/src/tide-pool']))));
  expect(byTestId('discovery-progress')[0]?.textContent).toBe('Adding harbor (2 of 2)');
  expect(adopts(calls).at(-1)).toEqual([
    '--json',
    'discover',
    'adopt',
    '--ids',
    'aaaaaaaa-0002',
    '--',
    '/src/harbor',
  ]);
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
    ['--json', 'discover', 'adopt', '--ids', '', '--', '/src/tide-pool'],
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
    ['--json', 'discover', 'adopt', '--ids', '', '--', '/src/tide-pool'],
  ]);
});

const reasons = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('discovery-live-reason').map((el) => el.textContent);

test('a running session that cannot be ticked says why', async () => {
  const { byTestId } = await open(undefined, CANNOT_TICK);
  expect(reasons(byTestId)).toEqual([
    'in a registered project',
    'no project folder',
    'its folder cannot be added',
  ]);
  const adopt = byTestId('discovery-live-adopt');
  expect(adopt.map((b) => b.getAttribute('aria-label'))).toEqual(['Adopt Lamp wicks']);
  const rows = [...(byTestId('discovery-live')[0]?.querySelectorAll('li') ?? [])];
  expect(rows[0]?.contains(adopt[0] ?? null)).toBe(true);
  // Only harbor's session, in an unregistered folder without an error, keeps its tick.
  const tick = byTestId('discovery-live-tick');
  expect(tick).toHaveLength(1);
  expect(rows[3]?.contains(tick[0] ?? null)).toBe(true);
  expect(checked(tick[0])).toBe(false);
  const harbor = byTestId('discovery-tick')[1];
  await click(harbor);
  expect(byTestId('discovery-live-tick')[0]?.hasAttribute('disabled')).toBe(true);
  await click(harbor);
  expect(byTestId('discovery-live-tick')[0]?.hasAttribute('disabled')).toBe(false);
  expect(checked(byTestId('discovery-live-tick')[0])).toBe(false);
});

test('Adopt adopts and reopens just that running session', async () => {
  const { byTestId, calls } = await open(undefined, CANNOT_TICK);
  await click(byTestId('discovery-live-adopt')[0]);
  expect(calls.slice(1)).toEqual([
    ['--json', 'adopt', '--', '7c2d3e4f-1a2b-4c3d-9e8f-0a1b2c3d4e5f'],
  ]);
  expect(calls.some((args) => args[1] === 'discover' && args[2] === 'adopt')).toBe(false);
  expect(toasts(byTestId)).toEqual([
    [
      'alert',
      'Adopted as c0ffee12; end the session in its original terminal first: both hold the same transcript',
    ],
  ]);
  expect(reasons(byTestId)).toEqual([
    'adopted as c0ffee12',
    'no project folder',
    'its folder cannot be added',
  ]);
  expect(byTestId('discovery-live-adopt')).toHaveLength(0);
  expect(byTestId('discovery-live-tick')).toHaveLength(1);
  expect(byTestId('discovery-add')[0]?.hasAttribute('disabled')).toBe(false);
});

test('a failed Adopt shows its error and keeps the button', async () => {
  const { byTestId } = await open(undefined, CANNOT_TICK, () =>
    failure('No running claude session 7c2d3e4f'),
  );
  await click(byTestId('discovery-live-adopt')[0]);
  expect(toasts(byTestId)).toEqual([['alert', 'No running claude session 7c2d3e4f']]);
  expect(reasons(byTestId)[0]).toBe('in a registered project');
  expect(byTestId('discovery-live-adopt')).toHaveLength(1);
});
