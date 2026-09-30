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
  const textSession = document.querySelector<HTMLButtonElement>(
    '[aria-label="Open session bbbbbbbb: Chart shoals"]',
  );
  expect(textSession).not.toBeNull();
  expect(button('wiki/sessions/aaaaaaaa.md')).toBeDefined();
  expect(calls.some((args) => args[1] === 'map')).toBe(false);
  await click(textSession ?? undefined);
  await click(button('wiki/sessions/aaaaaaaa.md'));
  await click(button('Open session aaaaaaaa'));
  await click(button('Open in Obsidian'));
  expect(navigation).toEqual([
    ['session', 'bbbbbbbb'],
    ['vault', 'wiki/sessions/aaaaaaaa.md'],
    ['session', 'aaaaaaaa'],
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
      'No map yet. Use Update map.',
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

test.each(['success', 'failure'] as const)(
  'pending Map update belongs to its profile: late %s cannot refresh or toast in a replacement sharing its vault path',
  async (result) => {
    const late = deferred();
    const first = fakeBridge({ ...answers, map: () => late.promise });
    const nextLook = deferred();
    const next = fakeBridge({
      ...answers,
      'vault list': () => nextLook.promise,
      map: () => envelope({ path: 'map.canvas', changed: false, groups: 1, nodes: 4, edges: 1 }),
    });
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
    const byTestId = await renderWithMesa(<Profiles />, first.bridge);
    await click(button('Update map'));
    expect(button('Updating...')?.disabled).toBe(true);
    await act(async () => use(next.bridge));
    expect(button('Updating...')).toBeUndefined();
    expect(button('Update map')?.disabled).toBe(true);
    await act(async () =>
      nextLook.resolve(envelope({ vault: '/h/vault', total: 1, items: [item] })),
    );
    expect(button('Update map')?.disabled).toBe(false);
    expect(body()).toContain('Chart shoals');
    const calls = [first.calls.length, next.calls.length];
    await act(async () =>
      late.resolve(
        result === 'failure'
          ? failure('old profile failed')
          : envelope({ path: 'map.canvas', changed: true, groups: 1, nodes: 4, edges: 1 }),
      ),
    );
    expect([first.calls.length, next.calls.length]).toEqual(calls);
    expect(toastTexts(byTestId)).toEqual([]);
    expect(button('Update map')?.disabled).toBe(false);
    await click(button('Update map'));
    expect(next.calls).toContainEqual(['--json', 'map']);
    expect(button('Update map')?.disabled).toBe(false);
  },
);

test('all saved nodes and directed edges retain coordinates, target names and keyboard actions', async () => {
  const navigation: string[][] = [];
  const extra = {
    ...canvas,
    nodes: [
      ...canvas.nodes,
      {
        id: 'personal-note',
        type: 'file',
        file: 'wiki/tide #2|chart (draft).md',
        x: -300,
        y: 600,
        width: 300,
        height: 140,
      },
      {
        id: 'personal-link',
        type: 'link',
        url: 'https://example.com/chart',
        x: 600,
        y: 600,
        width: 200,
        height: 100,
      },
    ],
    edges: [
      ...canvas.edges,
      { id: 'personal-edge', fromNode: 'personal-note', toNode: 'personal-link', label: 'reads' },
    ],
  };
  const { bridge, calls } = fakeBridge({
    ...answers,
    'vault read': () => envelope({ ...read, canvas: extra }),
  });
  await renderWithMesa(
    <MapScreen
      onSession={(id) => navigation.push(['session', id])}
      onVaultItem={(path) => navigation.push(['vault', path])}
    />,
    bridge,
  );
  expect(
    [...document.querySelectorAll('[data-canvas-node]')]
      .map((n) => n.getAttribute('data-canvas-node'))
      .sort(),
  ).toEqual(extra.nodes.map((n: { id: string }) => n.id).sort());
  for (const node of extra.nodes) {
    const element = [...document.querySelectorAll('[data-canvas-node]')].find(
      (n) => n.getAttribute('data-canvas-node') === node.id,
    );
    const geometry = node.type === 'group' ? element?.querySelector('rect') : element;
    for (const property of ['x', 'y', 'width', 'height'] as const)
      expect(geometry?.getAttribute(property)).toBe(String(node[property]));
  }
  expect(
    [...document.querySelectorAll('[data-canvas-edge]')].map((e) => [
      e.getAttribute('data-canvas-edge'),
      e.getAttribute('data-from'),
      e.getAttribute('data-to'),
    ]),
  ).toEqual(
    extra.edges.map((e: { id: string; fromNode: string; toNode: string }) => [
      e.id,
      e.fromNode,
      e.toNode,
    ]),
  );
  expect(document.querySelectorAll('line[marker-end]')).toHaveLength(extra.edges.length);
  const resume = document.querySelector('[data-canvas-edge="resume:aaaaaaaa:bbbbbbbb"] line');
  expect(['x1', 'y1', 'x2', 'y2'].map((property) => resume?.getAttribute(property))).toEqual([
    '340',
    '165',
    '360',
    '165',
  ]);
  const file = document.querySelector<HTMLButtonElement>(
    '[aria-label="Open vault file wiki/tide #2|chart (draft).md"]',
  );
  expect(file).not.toBeNull();
  file?.focus();
  expect(document.activeElement).toBe(file);
  // Native buttons own Enter activation; a keyboard-generated click follows the same exact target.
  await act(async () => file?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })));
  const session = document.querySelector<HTMLButtonElement>(
    '[aria-label="Open session bbbbbbbb: Chart shoals"]',
  );
  session?.focus();
  await act(async () =>
    session?.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 })),
  );
  expect(navigation).toEqual([
    ['vault', 'wiki/tide #2|chart (draft).md'],
    ['session', 'bbbbbbbb'],
  ]);
  await click(button('Actual size and scroll'));
  expect(
    document.querySelector('svg[aria-label="Saved session map"]')?.classList.contains('w-full'),
  ).toBe(false);
  await click(button('Fit map'));
  expect(calls.some((args) => args[1] === 'map')).toBe(false);
});

test('a saved self-edge has a visible directed loop without moving its node', async () => {
  const self = {
    id: 'self',
    fromNode: 'session:lantern-cove:aaaaaaaa',
    toNode: 'session:lantern-cove:aaaaaaaa',
  };
  const { bridge } = fakeBridge({
    ...answers,
    'vault read': () =>
      envelope({ ...read, canvas: { ...canvas, edges: [...canvas.edges, self] } }),
  });
  await renderWithMesa(<MapScreen onSession={() => {}} onVaultItem={() => {}} />, bridge);
  const stroke = document.querySelector('[data-canvas-edge="self"] path[marker-end]');
  expect(stroke).not.toBeNull();
  expect(stroke?.getAttribute('d')).toContain('M 340 165 C');
  expect(stroke?.getAttribute('d')).toContain('L 180 60');
  const node = document.querySelector('[data-canvas-node="session:lantern-cove:aaaaaaaa"]');
  expect(node?.getAttribute('x')).toBe('20');
  expect(node?.getAttribute('y')).toBe('60');
});
