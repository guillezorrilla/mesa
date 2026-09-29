// @vitest-environment happy-dom
import type { VaultInventory, VaultItem } from '@mesa/core';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { VaultScreen } from './VaultScreen';

const at = '2026-09-24T12:00:00.000Z';
const item = (path: string, over: Partial<VaultItem>): VaultItem => ({
  path,
  kind: 'markdown',
  category: 'user',
  size: 10,
  modified: at,
  ...over,
});
const ITEMS: VaultItem[] = [
  item('AGENTS.md', { category: 'agents' }),
  item('Garden/Seeds/kale.md', {}),
  item('Garden/beds.base', { kind: 'base' }),
  item('index.md', { category: 'index' }),
  item('log.md', { category: 'log' }),
  item('projects/tide.md', { category: 'projects', project: 'tide' }),
  item('projects/tide/map.canvas', { kind: 'canvas', category: 'projects', project: 'tide' }),
  item('raw/chart.png', { kind: 'attachment', category: 'raw', size: 2048 }),
  item('receipts/2026/09/a.md', { category: 'receipts', project: 'tide' }),
  item('receipts/2026/09/b.md', { category: 'receipts', project: 'lantern-cove' }),
  item('wiki/harbour.md', { category: 'wiki', unavailable: 'outside the vault' }),
];
const INVENTORY: VaultInventory = { vault: '/h/vault', total: ITEMS.length, items: ITEMS };

const labels = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('vault-folder').map((row) => row.getAttribute('aria-label'));
const files = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('vault-file').map((row) => [row.textContent, row.dataset.kind]);
const folder = (byTestId: (id: string) => HTMLElement[], name: string) =>
  byTestId('vault-folder').find((row) => row.getAttribute('aria-label')?.startsWith(`${name},`));

test('the vault tree shows the top level with counts, and a folder opens on its own', async () => {
  const { bridge, calls } = fakeBridge({ 'vault list': () => envelope(INVENTORY) });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  expect(calls).toContainEqual(['--json', 'vault', 'list']);
  expect(byTestId('vault-panel')[0]?.textContent).toContain('11 items in /h/vault');
  expect(labels(byTestId)).toEqual([
    'Garden, 2 items',
    'projects, 2 items',
    'raw, 1 item',
    'receipts, 2 items',
    'wiki, 1 item',
  ]);
  expect(files(byTestId)).toEqual([
    ['AGENTS.mdmarkdown', 'markdown'],
    ['index.mdmarkdown', 'markdown'],
    ['log.mdmarkdown', 'markdown'],
  ]);

  await click(folder(byTestId, 'receipts'));
  expect(folder(byTestId, 'receipts')?.getAttribute('aria-expanded')).toBe('true');
  expect(labels(byTestId)).toContain('2026, 2 items');
  expect(labels(byTestId)).not.toContain('09, 2 items'); // deeper folders stay closed
  await click(folder(byTestId, '2026'));
  await click(folder(byTestId, '09'));
  expect(files(byTestId).map(([name]) => name)).toContain('a.mdmarkdown');
  await click(folder(byTestId, 'receipts'));
  expect(labels(byTestId)).not.toContain('2026, 2 items');

  await click(folder(byTestId, 'Garden'));
  expect(files(byTestId)).toContainEqual(['beds.basebase', 'base']);
  expect(labels(byTestId)).toContain('Seeds, 1 item');
});

test('project and type filters narrow the tree and its counts', async () => {
  const { bridge } = fakeBridge({ 'vault list': () => envelope(INVENTORY) });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  const projectSelect = document.querySelector<HTMLSelectElement>('#vault-project');
  const typeSelect = document.querySelector<HTMLSelectElement>('#vault-type');
  expect([...(projectSelect?.options ?? [])].map((o) => o.value)).toEqual([
    '',
    'lantern-cove',
    'tide',
  ]);

  await choose(projectSelect ?? undefined, 'tide');
  expect(labels(byTestId)).toEqual(['projects, 2 items', 'receipts, 1 item']);
  expect(files(byTestId)).toEqual([]);
  expect(byTestId('vault-shown')[0]?.textContent).toBe('3 of 11 shown');

  await choose(typeSelect ?? undefined, 'canvas');
  expect(labels(byTestId)).toEqual(['projects, 1 item']);

  await choose(projectSelect ?? undefined, '');
  await choose(typeSelect ?? undefined, 'receipts');
  expect(labels(byTestId)).toEqual(['receipts, 2 items']);
  await choose(typeSelect ?? undefined, 'attachment');
  expect(labels(byTestId)).toEqual(['raw, 1 item']);
  await choose(typeSelect ?? undefined, 'index');
  expect(labels(byTestId)).toEqual([]);
  expect(files(byTestId)).toEqual([['index.mdmarkdown', 'markdown']]);
});

test('selecting an item shows its path and kind; an unavailable one says why', async () => {
  const { bridge } = fakeBridge({ 'vault list': () => envelope(INVENTORY) });
  const byTestId = await renderWithMesa(<VaultScreen />, bridge);
  expect(byTestId('vault-item')[0]?.textContent).toContain('Select an item');

  await click(folder(byTestId, 'raw'));
  const chart = byTestId('vault-file').find((row) => row.textContent?.startsWith('chart.png'));
  await click(chart);
  expect(chart?.getAttribute('aria-pressed')).toBe('true');
  const fact = (name: string) =>
    byTestId('vault-item')[0]?.querySelector(`[data-fact="${name}"]`)?.textContent;
  expect([fact('Path'), fact('Kind'), fact('Category'), fact('Size')]).toEqual([
    'raw/chart.png',
    'attachment',
    'raw',
    '2,048 bytes',
  ]);
  expect(byTestId('vault-item-unavailable')).toEqual([]);

  await click(folder(byTestId, 'wiki'));
  await click(byTestId('vault-file').find((row) => row.textContent?.startsWith('harbour.md')));
  expect(fact('Path')).toBe('wiki/harbour.md');
  expect(byTestId('vault-item-unavailable')[0]?.textContent).toContain('outside the vault');
});
