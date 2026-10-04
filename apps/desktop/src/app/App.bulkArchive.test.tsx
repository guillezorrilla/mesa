// @vitest-environment happy-dom

import { act } from 'react';
import { expect, test } from 'vitest';
import {
  click,
  envelope,
  fakeBridge,
  managedRow,
  PROJECTS,
  renderWithMesa,
  toasts,
} from '@/lib/testing';
import { App } from './App';

const IDS = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'];
const card = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="sidebar-session"][title*="${id}"]`) ??
  undefined;
const selected = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="sidebar-session"]')]
    .filter((element) => element.getAttribute('aria-selected') === 'true')
    .map((element) => IDS.find((id) => element.title.includes(id)));
const clickWith = (
  element: HTMLElement | undefined,
  keys: { shiftKey?: boolean; metaKey?: boolean },
) =>
  act(async () => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true, ...keys }));
  });
const rightClick = (element: HTMLElement | undefined) =>
  act(async () => {
    element?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80 }),
    );
  });
const menuItems = () =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => item.textContent);

/**
 * Three live sessions in one project; `archive` archives the ids it is given, except `failing`,
 * and says `warned` archived with a warning.
 */
async function setup({ failing, warned }: { failing?: string; warned?: string } = {}) {
  const archived = new Set<string>();
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () => envelope(IDS.filter((id) => !archived.has(id)).map((id) => managedRow(id))),
    archive: (args) => {
      const ids = args.slice(args.indexOf('--') + 1);
      const items = ids.map((id) => {
        if (id === failing)
          return { id, ok: false, error: { code: 'usage', message: `session ${id} is locked` } };
        archived.add(id);
        return {
          id,
          ok: true,
          result: {
            ...managedRow(id),
            archivedAt: '2026-10-03T12:00:00.000Z',
            receipt: null,
            ...(id === warned ? { warning: 'receipt not written' } : {}),
          },
        };
      });
      return envelope({ items });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  return { byTestId, calls };
}

test('Shift-click selects three cards and the right-click menu archives them together', async () => {
  const { byTestId, calls } = await setup();
  const list = document.querySelector('[role="listbox"]');
  expect(list?.getAttribute('aria-multiselectable')).toBe('true');
  expect(list?.getAttribute('aria-label')).toBe('Sessions');
  await click(card('aaaaaaaa'));
  expect(card('aaaaaaaa')?.getAttribute('aria-current')).toBe('page');
  await clickWith(card('cccccccc'), { shiftKey: true });
  expect(selected()).toEqual(IDS);
  expect(card('aaaaaaaa')?.getAttribute('aria-current')).toBe('page');

  await rightClick(card('bbbbbbbb'));
  expect(menuItems()).toEqual(['Archive 3 sessions']);
  await click(document.querySelector<HTMLElement>('[role="menuitem"]') ?? undefined);
  expect(menuItems()).toEqual([]);
  expect(byTestId('archive-dialog')).toHaveLength(1);
  expect(byTestId('archive-dialog')[0]?.querySelector('h2')?.textContent).toBe(
    'Archive 3 sessions?',
  );
  expect(calls.some((args) => args[1] === 'archive')).toBe(false);

  await click(byTestId('archive-confirm')[0]);
  expect(calls).toContainEqual(['--json', 'archive', '--', ...IDS]);
  expect(byTestId('archive-dialog')).toHaveLength(0);
  expect(byTestId('sidebar-session')).toHaveLength(0);
  expect(toasts(byTestId)).toContainEqual(['confirmation', 'Archived 3 sessions']);
});

test('Cmd-click toggles a card out, and Escape or a plain click leave one selected', async () => {
  await setup();
  await click(card('aaaaaaaa'));
  await clickWith(card('cccccccc'), { shiftKey: true });
  await clickWith(card('bbbbbbbb'), { metaKey: true });
  expect(selected()).toEqual(['aaaaaaaa', 'cccccccc']);
  await act(async () => {
    card('cccccccc')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(selected()).toEqual(['aaaaaaaa']);

  await clickWith(card('bbbbbbbb'), { metaKey: true });
  expect(selected()).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  await click(card('cccccccc'));
  expect(selected()).toEqual(['cccccccc']);
  expect(card('cccccccc')?.getAttribute('aria-current')).toBe('page');
});

test('right-click on an unselected card makes it the selection: Archive session', async () => {
  await setup();
  await click(card('aaaaaaaa'));
  await clickWith(card('bbbbbbbb'), { metaKey: true });
  await rightClick(card('cccccccc'));
  expect(selected()).toEqual(['cccccccc']);
  expect(menuItems()).toEqual(['Archive session']);
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
  });
  expect(menuItems()).toEqual([]);
});

test('a failed item gives an alert naming it, and its card stays', async () => {
  const { byTestId } = await setup({ failing: 'bbbbbbbb' });
  await click(card('aaaaaaaa'));
  await clickWith(card('cccccccc'), { shiftKey: true });
  await rightClick(card('aaaaaaaa'));
  await click(document.querySelector<HTMLElement>('[role="menuitem"]') ?? undefined);
  await click(byTestId('archive-confirm')[0]);
  expect(toasts(byTestId)).toContainEqual([
    'alert',
    'Archived 2 sessions\nbbbbbbbb: session bbbbbbbb is locked',
  ]);
  expect(byTestId('sidebar-session')).toHaveLength(1);
  expect(card('bbbbbbbb')).toBeDefined();
});

/** Clicks the first card, Shift-clicks the third, and right-clicks the second. */
async function menuOnThree() {
  await click(card('aaaaaaaa'));
  await clickWith(card('cccccccc'), { shiftKey: true });
  await rightClick(card('bbbbbbbb'));
  expect(menuItems()).toEqual(['Archive 3 sessions']);
}

test('Escape on the open menu closes it and keeps the selection', async () => {
  await setup();
  await menuOnThree();
  await act(async () => {
    document
      .querySelector('[role="menuitem"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(menuItems()).toEqual([]);
  expect(selected()).toEqual(IDS);
});

test('a pointerdown outside the open menu closes it', async () => {
  await setup();
  await menuOnThree();
  await act(async () => {
    // Radix starts listening for outside pointerdowns on the next tick after it opens.
    await new Promise((done) => setTimeout(done, 0));
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }),
    );
  });
  expect(menuItems()).toEqual([]);
  expect(selected()).toEqual(IDS);
});

test('a warning on an archived item is listed, with no alert when none failed', async () => {
  const { byTestId } = await setup({ warned: 'bbbbbbbb' });
  await menuOnThree();
  await click(document.querySelector<HTMLElement>('[role="menuitem"]') ?? undefined);
  await click(byTestId('archive-confirm')[0]);
  expect(toasts(byTestId)).toContainEqual([
    'confirmation',
    'Archived 3 sessions\nbbbbbbbb: receipt not written',
  ]);
});
