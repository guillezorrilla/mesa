// @vitest-environment happy-dom

import type { VaultItem, VaultRead } from '@mesa/core';
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
  toastTexts,
} from '@/lib/testing';
import golden from '../../../../packages/core/src/map/fixtures/map.canvas?raw';
import { MapScreen } from './MapScreen';

// The identical invented golden used by the core writer is rendered through the saved reader model.
const canvas = JSON.parse(golden);
const item: VaultItem = {
  path: 'map.canvas',
  kind: 'canvas',
  category: 'user',
  size: 10,
  modified: '2026-09-24T12:00:00.000Z',
};
const read: VaultRead = {
  ...item,
  uri: 'obsidian://open?vault=vault&file=map.canvas',
  backlinks: [],
  preview: 'canvas',
  canvas,
  nodes: 4,
  edges: 1,
  texts: canvas.nodes
    .filter((n: { type: string }) => n.type === 'text')
    .map((n: { text: string }) => n.text),
};
const answers = {
  'vault list': () => envelope({ vault: '/h/vault', total: 1, items: [item] }),
  'vault read': () => envelope(read),
};
const button = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === text);
const body = () => document.querySelector('[data-testid="map-screen"]')?.textContent;

test('saved map rows match the core Canvas, read never writes, and actions target exact session/summary/map', async () => {
  const navigation: string[][] = [];
  const { bridge, calls } = fakeBridge({
    ...answers,
    'vault open': () => envelope({ opened: true }),
  });
  await renderWithMesa(
    <MapScreen
      onSession={(id) => navigation.push(['session', id])}
      onVaultItem={(path) => navigation.push(['vault', path])}
    />,
    bridge,
  );
  expect(body()).toContain('Lantern Cove');
  expect(button('Chart shoals')).toBeDefined();
  expect(button('aaaaaaaa')).toBeDefined();
  expect(calls.some((args) => args[1] === 'map')).toBe(false);
  await click(button('Chart shoals'));
  await click(button('Open summary aaaaaaaa'));
  await click(button('Open in Obsidian'));
  expect(navigation).toEqual([
    ['session', 'bbbbbbbb'],
    ['vault', 'wiki/sessions/aaaaaaaa.md'],
  ]);
  expect(calls).toContainEqual(['--json', 'vault', 'open', '--', 'map.canvas']);
});

test('Update explicitly regenerates and rereads, a no-op refreshes, and a failed update keeps the saved map', async () => {
  let updates = 0;
  const { bridge, calls } = fakeBridge({
    ...answers,
    map: () =>
      ++updates === 3
        ? failure('Map is locked')
        : envelope({ path: 'map.canvas', changed: updates === 1, groups: 1, nodes: 4, edges: 1 }),
  });
  const byTestId = await renderWithMesa(
    <MapScreen onSession={() => {}} onVaultItem={() => {}} />,
    bridge,
  );
  const reads = () => calls.filter((args) => args[1] === 'vault' && args[2] === 'read').length;
  expect(reads()).toBe(1);
  await click(button('Update map'));
  expect(calls).toContainEqual(['--json', 'map']);
  expect(reads()).toBe(2);
  await click(button('Update map'));
  expect(reads()).toBe(3);
  await click(button('Update map'));
  expect(reads()).toBe(3);
  expect(body()).toContain('Chart shoals');
  expect(toastTexts(byTestId)).toContain('Map is locked');
});

test('missing, empty and malformed saved maps are explicit and do not cause regeneration', async () => {
  for (const [extra, message] of [
    [
      { 'vault list': () => envelope({ vault: '/h/vault', total: 0, items: [] }) },
      'No map yet. Use Update map.',
    ],
    [
      { 'vault read': () => envelope({ ...read, canvas: { nodes: [], edges: [] } }) },
      'No sessions in the saved map.',
    ],
    [
      { 'vault read': () => envelope({ ...read, canvas: null }) },
      'Map unavailable: invalid Canvas geometry or references',
    ],
    [{ 'vault read': () => failure('map was removed') }, 'Map unavailable: map was removed'],
  ] as const) {
    const { bridge, calls } = fakeBridge({ ...answers, ...extra });
    await renderWithMesa(<MapScreen onSession={() => {}} onVaultItem={() => {}} />, bridge);
    expect(body()).toContain(message);
    expect(calls.some((args) => args[1] === 'map')).toBe(false);
  }
});

test('a profile change clears old map content immediately and ignores the old profile late read', async () => {
  const pending = deferred();
  let reads = 0;
  const first = fakeBridge({
    ...answers,
    'vault read': () => (++reads === 1 ? envelope(read) : pending.promise),
  });
  const otherLook = deferred();
  const other = fakeBridge({ 'vault list': () => otherLook.promise });
  let use: (bridge: Bridge) => void = () => {};
  function Profiles() {
    const [bridge, setBridge] = useState<Bridge>(() => first.bridge);
    use = (next) => setBridge(() => next);
    return (
      <MesaRoot bridge={bridge} platform={fakePlatform()}>
        <MapScreen onSession={() => {}} onVaultItem={() => {}} />
      </MesaRoot>
    );
  }
  await renderWithMesa(<Profiles />, first.bridge);
  expect(body()).toContain('Chart shoals');
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => use(other.bridge));
  expect(body()).toContain('Reading vault...');
  expect(body()).not.toContain('Chart shoals');
  await act(async () => {
    pending.resolve(envelope(read));
    otherLook.resolve(envelope({ vault: '/h/other-vault', total: 0, items: [] }));
  });
  expect(body()).toContain('No map yet. Use Update map.');
  expect(body()).not.toContain('Lantern Cove');
});
