// @vitest-environment happy-dom
import type { NativeDiscovery } from '@mesa/core';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
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
  total: 13,
  truncated: false,
  unsupported: [{ agent: 'antigravity', reason: 'No qualified native CLI history source' }],
};

test('Find from sessions lists folders with counts and running sessions, and registers one', async () => {
  const onRegistered = vi.fn(async () => {});
  const { bridge, calls } = fakeBridge({
    discover: () => envelope(FOUND),
    register: () => envelope({ name: 'tide-pool', receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <DiscoveryDialog onCancel={() => {}} onRegistered={onRegistered} />,
    bridge,
  );
  expect(calls).toEqual([['--json', 'discover']]);
  const rows = byTestId('discovered-project');
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining('12 conversations, 1 running'),
    expect.stringContaining('1 conversation'),
  ]);
  expect(rows[0]?.textContent).toContain('/src/tide-pool');
  expect(rows[1]?.querySelector('button')).toBeNull();
  expect(rows[1]?.textContent).toContain('Registered');
  const live = byTestId('discovery-live')[0]?.querySelectorAll('li') ?? [];
  expect([...live].map((li) => li.textContent)).toEqual([
    'Tide tablesclaude/src/tide-pool',
    '01a0e14e-be41-72f1-a81b-e25d2198602acodex/src/tide-pool/docs',
  ]);
  expect(byTestId('discovery-total')[0]?.textContent).toBe('13 conversations in the last 30 days.');

  await click(rows[0]?.querySelector('button') as HTMLElement);
  expect(calls.filter((args) => args[1] === 'register')).toEqual([
    ['--json', 'register', '--create', '--', '/src/tide-pool'],
  ]);
  expect(onRegistered).toHaveBeenCalledOnce();
  expect(byTestId('discovered-project')[0]?.textContent).toContain('Registered');
  expect(byTestId('discovered-project')[0]?.querySelector('button')).toBeNull();
});
