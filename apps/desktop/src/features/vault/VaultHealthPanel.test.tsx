// @vitest-environment happy-dom
import type { VaultHealth, VaultInventory } from '@mesa/core';
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import type { Bridge } from '@/lib/client';
import { MesaRoot } from '@/lib/MesaRoot';
import {
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  renderWithMesa,
} from '@/lib/testing';
import { VaultScreen } from './VaultScreen';

const inventory: VaultInventory = {
  vault: '/h/vault',
  total: 1,
  items: [
    {
      path: 'wiki/rule.md',
      kind: 'markdown',
      category: 'wiki',
      size: 20,
      modified: '2026-09-24T12:00:00.000Z',
    },
  ],
};
const report: VaultHealth = {
  vault: inventory.vault,
  checked: 2,
  findings: [
    {
      kind: 'broken-link',
      path: 'wiki/rule.md',
      line: 2,
      message: 'Link [[missing]] has no target in the vault inventory.',
    },
  ],
  limitations: ['Heading and block fragments are not checked.'],
};

test('health runs only on request, opens the exact finding and rechecks to a clean result', async () => {
  const pending = deferred();
  let checks = 0;
  const { bridge, calls } = fakeBridge({
    'vault list': () => envelope(inventory),
    'vault health': () =>
      ++checks === 1 ? pending.promise : envelope({ ...report, findings: [] }),
    'vault read': () =>
      envelope({
        ...inventory.items[0],
        preview: 'markdown',
        frontmatter: {},
        body: '# Rule\n[[missing]]\n',
        links: [],
        backlinks: [],
        uri: 'obsidian://open',
      }),
  });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  const byId = (id: string) => byTestId(id)[0];
  expect(calls.some((argv) => argv.includes('health'))).toBe(false);
  await click(byId('vault-health-check'));
  expect((byId('vault-health-check') as HTMLButtonElement).disabled).toBe(true);
  await act(async () => pending.resolve(envelope(report)));
  expect(byId('vault-health-panel')?.textContent).toContain('1 finding');
  await click(byId('vault-health-path'));
  expect(calls).toContainEqual(['--json', 'vault', 'read', '--', 'wiki/rule.md']);
  await click(byId('vault-health-check'));
  expect(byId('vault-health-panel')?.textContent).toContain('No findings');
  expect(byId('vault-health-panel')?.textContent).not.toContain('Link [[missing]]');
});

test('health clears on a profile change, ignores late replies, and recovers from a failed check', async () => {
  const pending = deferred();
  const first = fakeBridge({
    'vault list': () => envelope(inventory),
    'vault health': () => pending.promise,
  });
  let checks = 0;
  const next = fakeBridge({
    'vault list': () => envelope({ ...inventory, total: 0, items: [] }),
    'vault health': () =>
      ++checks === 1 ? failure('vault unavailable') : envelope({ ...report, findings: [] }),
  });
  let change: (bridge: Bridge) => void = () => {};
  function Profiles() {
    const [bridge, setBridge] = useState<Bridge>(() => first.bridge);
    change = (next) => setBridge(() => next);
    return (
      <MesaRoot bridge={bridge} platform={fakePlatform()}>
        <VaultScreen />
      </MesaRoot>
    );
  }
  const byTestId = await renderWithMesa(<Profiles />, first.bridge);
  const byId = (id: string) => byTestId(id)[0];
  await click(byId('vault-health-check'));
  await act(async () => change(next.bridge));
  await act(async () => pending.resolve(envelope(report)));
  expect(byId('vault-health-panel')?.textContent).not.toContain('Link [[missing]]');
  await click(byId('vault-health-check'));
  expect(byId('vault-health-panel')?.textContent).toContain('vault unavailable');
  await click(byId('vault-health-check'));
  expect(byId('vault-health-panel')?.textContent).toContain('No findings');
  expect(byId('vault-health-panel')?.textContent).not.toContain('vault unavailable');
});
