// @vitest-environment happy-dom

import type { ProjectRow } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, fakeBridge, managedRow, PROJECTS, press, renderWithMesa } from '@/lib/testing';
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
  expect(saves(calls)).toHaveLength(1);
});

/** Lays the rail's cards out 40px tall with a 4px gap, as the browser would measure them. */
function measure() {
  document.querySelectorAll<HTMLElement>('[data-drag-id]').forEach((wrapper, index) => {
    const top = index * 44;
    wrapper.getBoundingClientRect = () =>
      ({ top, bottom: top + 40, height: 40, left: 0, right: 200, width: 200 }) as DOMRect;
  });
}
const pointer = (target: EventTarget, type: string, clientY: number) =>
  act(async () => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        button: 0,
        clientX: 10,
        clientY,
        pointerType: 'mouse',
      }),
    );
  });

test('dragging a card lifts it, slides its siblings, and saves where it lands without selecting', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  const shown = byTestId('selected-session')[0]?.textContent;
  measure();
  const dragged = document.querySelector<HTMLElement>('[data-drag-id="cccccccc"]');
  if (!dragged) throw new Error('no draggable card');
  await pointer(dragged, 'pointerdown', 108);
  await pointer(window, 'pointermove', 60);
  expect(dragged.dataset.dragging).toBe('true');
  // Halfway up, past b's middle: b slides down to open the gap; a stays.
  expect(document.querySelector<HTMLElement>('[data-drag-id="bbbbbbbb"]')?.style.transform).toBe(
    'translateY(44px)',
  );
  expect(document.querySelector<HTMLElement>('[data-drag-id="aaaaaaaa"]')?.style.transform).toBe(
    'translateY(0px)',
  );
  // Far above the rail, it stops at the rail's top.
  await pointer(window, 'pointermove', -500);
  expect(dragged.style.transform).toBe('translateY(-88px)');
  // A browser clicks the card the press began on right after the release.
  await act(async () => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
    card('cccccccc')?.click();
  });
  expect(cardIds(byTestId)).toEqual(['cccccccc', 'aaaaaaaa', 'bbbbbbbb']);
  expect(saves(calls).map((args) => args[3])).toEqual([
    '--session-order=cccccccc,aaaaaaaa,bbbbbbbb',
  ]);
  expect(byTestId('selected-session')[0]?.textContent).toBe(shown);
});

test('Escape cancels a drag and saves nothing', async () => {
  const { bridge, calls } = setup();
  const byTestId = await renderWithMesa(<App />, bridge);
  measure();
  const dragged = document.querySelector<HTMLElement>('[data-drag-id="aaaaaaaa"]');
  if (!dragged) throw new Error('no draggable card');
  await pointer(dragged, 'pointerdown', 20);
  await pointer(window, 'pointermove', 120);
  await press(dragged, 'Escape');
  expect(dragged.dataset.dragging).toBeUndefined();
  await pointer(window, 'pointerup', 120);
  expect(cardIds(byTestId)).toEqual(['aaaaaaaa', 'bbbbbbbb', 'cccccccc']);
  expect(saves(calls)).toEqual([]);
});
