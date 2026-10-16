// @vitest-environment happy-dom

import type { ProjectRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { SAVE_DELAY_MS } from '@/features/sessions/sidebar/useReorderSessions';
import {
  envelope,
  failure,
  fakeBridge,
  managedRow,
  PROJECTS,
  pointer,
  press,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { App } from './App';

/** Three lantern-cove sessions and a project registry that keeps what `projects update` saves. */
function setup(saved: string[] = []) {
  let rows: ProjectRow[] = PROJECTS.map((row) =>
    row.name === 'lantern-cove' ? { ...row, sessionOrder: saved } : row,
  );
  const fake = fakeBridge({
    projects: () => envelope(rows),
    sessions: () =>
      envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb'), managedRow('cccccccc')]),
    'projects update': (args) => {
      const ids = args.find((arg) => arg.startsWith('--session-order='))?.slice(16) ?? '';
      rows = rows.map((row) =>
        row.name === args.at(-1) ? { ...row, sessionOrder: ids ? ids.split(',') : [] } : row,
      );
      return envelope({ name: args.at(-1), path: '/src/lantern-cove' });
    },
  });
  return fake;
}

const cardIds = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('sidebar-session').map((card) => card.dataset.sessionId);
const card = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="sidebar-session"][data-session-id="${id}"]`);
const saves = (calls: string[][]) => calls.filter((args) => args[2] === 'update');
/** Waits out the pause before a moved order saves. */
const settle = () => act(() => new Promise((done) => setTimeout(done, SAVE_DELAY_MS + 50)));

test("a project's cards show in its saved session order, new ones after", async () => {
  const { bridge } = setup(['cccccccc', 'aaaaaaaa']);
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(cardIds(byTestId)).toEqual(['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
});

test('Option+Arrow moves a card within its project, saves the order, and keeps focus', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  card('aaaaaaaa')?.focus();
  await press(card('aaaaaaaa'), 'ArrowDown', { altKey: true });
  expect(cardIds(byTestId)).toEqual(['bbbbbbbb', 'aaaaaaaa', 'cccccccc']);
  await settle();
  expect(saves(calls)).toEqual([
    [
      '--json',
      'projects',
      'update',
      '--session-order=bbbbbbbb,aaaaaaaa,cccccccc',
      '--',
      'lantern-cove',
    ],
  ]);
  expect(document.activeElement).toBe(card('aaaaaaaa'));
  // Past the top it stays, and saves nothing.
  await press(card('bbbbbbbb'), 'ArrowUp', { altKey: true });
  await settle();
  expect(saves(calls)).toHaveLength(1);
});

/** Lays the rail out as the browser would: its cards 40px tall with a 4px gap. */
function measure() {
  const rect = (top: number, height: number) =>
    ({
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 200,
      width: 200,
      x: 0,
      y: top,
    }) as DOMRect;
  const cards = [...document.querySelectorAll<HTMLElement>('[data-drag-id]')];
  cards.forEach((wrapper, index) => {
    wrapper.getBoundingClientRect = () => rect(index * 44, 40);
  });
  const rail = cards[0]?.parentElement;
  if (rail) rail.getBoundingClientRect = () => rect(0, cards.length * 44 - 4);
}
const at = (clientY: number) => ({ clientX: 10, clientY });

/** Presses card `id` at `from`, moves in steps to `to`, and releases there, as a pointer would. */
async function dragCard(id: string, from: number, to: number, release = true) {
  const dragged = document.querySelector<HTMLElement>(`[data-drag-id="${id}"]`);
  if (!dragged) throw new Error(`no draggable card ${id}`);
  await pointer(dragged, 'pointerdown', at(from));
  for (let step = 1; step <= 5; step++)
    await pointer(document, 'pointermove', at(from + ((to - from) * step) / 5));
  if (release) await pointer(document, 'pointerup', at(to));
  return dragged;
}

test('dragging a card lifts it and saves where it lands without selecting it', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  const shown = byTestId('selected-session')[0]?.textContent;
  measure();
  const dragged = await dragCard('cccccccc', 108, 20, false);
  expect(dragged.dataset.dragging).toBe('true');
  // A browser clicks the card the press began on right after the release.
  await act(async () => {
    document.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true, button: 0, isPrimary: true, ...at(20) }),
    );
    card('cccccccc')?.click();
  });
  expect(dragged.dataset.dragging).toBeUndefined();
  expect(cardIds(byTestId)).toEqual(['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
  await settle();
  expect(saves(calls).map((args) => args[3])).toEqual([
    '--session-order=cccccccc,aaaaaaaa,bbbbbbbb',
  ]);
  expect(byTestId('selected-session')[0]?.textContent).toBe(shown);
});

test('Escape cancels a drag and saves nothing', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  measure();
  const dragged = await dragCard('aaaaaaaa', 20, 120, false);
  expect(dragged.dataset.dragging).toBe('true');
  await press(document.body, 'Escape', { code: 'Escape' });
  expect(dragged.dataset.dragging).toBeUndefined();
  await pointer(document, 'pointerup', at(120));
  await settle();
  expect(cardIds(byTestId)).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
  expect(saves(calls)).toEqual([]);
});

test('moves in quick succession save once, with the last order', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  await press(card('aaaaaaaa'), 'ArrowDown', { altKey: true });
  await press(card('aaaaaaaa'), 'ArrowDown', { altKey: true });
  expect(cardIds(byTestId)).toEqual(['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
  await settle();
  expect(saves(calls).map((args) => args[3])).toEqual([
    '--session-order=bbbbbbbb,cccccccc,aaaaaaaa',
  ]);
  expect(cardIds(byTestId)).toEqual(['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
});

test('dragging past the last card lands it last, and past the first lands it first', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  measure();
  await dragCard('aaaaaaaa', 20, 400);
  await settle();
  expect(cardIds(byTestId)).toEqual(['bbbbbbbb', 'cccccccc', 'aaaaaaaa']);
  measure();
  await dragCard('aaaaaaaa', 108, -400);
  await settle();
  expect(cardIds(byTestId)).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
  expect(saves(calls)).toHaveLength(2);
});

test('a saved order stays shown while the sorted project list still reads the old one', async () => {
  let rows: ProjectRow[] = PROJECTS;
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(rows),
    // The sidebar's sorted read lags: it still answers the order from before the save.
    'projects --sort': () => envelope(PROJECTS),
    sessions: () =>
      envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb'), managedRow('cccccccc')]),
    'projects update': (args) => {
      const ids = args.find((arg) => arg.startsWith('--session-order='))?.slice(16) ?? '';
      rows = rows.map((row) =>
        row.name === args.at(-1) ? { ...row, sessionOrder: ids.split(',') } : row,
      );
      return envelope({ name: args.at(-1), path: '/src/lantern-cove' });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await press(card('cccccccc'), 'ArrowUp', { altKey: true });
  await settle();
  await settle();
  expect(saves(calls)).toHaveLength(1);
  expect(calls.some((args) => args[1] === 'projects' && args[2] === '--sort')).toBe(true);
  expect(cardIds(byTestId)).toEqual(['aaaaaaaa', 'cccccccc', 'bbbbbbbb']);
});

test('a failed save says why and shows the saved order again', async () => {
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb'), managedRow('cccccccc')]),
    'projects update': () => failure('registry is locked', 'conflict'),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await press(card('cccccccc'), 'ArrowUp', { altKey: true });
  expect(cardIds(byTestId)).toEqual(['aaaaaaaa', 'cccccccc', 'bbbbbbbb']);
  await settle();
  expect(saves(calls)).toHaveLength(1);
  expect(toastTexts(byTestId)).toContain('registry is locked');
  expect(cardIds(byTestId)).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
});
