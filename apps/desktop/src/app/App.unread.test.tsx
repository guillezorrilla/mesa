// @vitest-environment happy-dom

import { act } from 'react';
import { expect, test } from 'vitest';
import {
  click,
  envelope,
  fakeBridge,
  managedRow,
  PROJECTS,
  press,
  renderWithMesa,
} from '@/lib/testing';
import { App } from './App';

const IDLE = {
  state: 'idle',
  confidence: 0.95,
  at: '2026-09-25T12:01:00.000Z',
  source: 'hook',
} as const;
const card = (id: string) =>
  document.querySelector<HTMLElement>(`[data-testid="sidebar-session"][data-session-id="${id}"]`) ??
  undefined;
const unread = (id: string) => card(id)?.dataset.unread === 'true';
const windowFocus = (focused: boolean) =>
  act(async () => {
    window.dispatchEvent(new Event(focused ? 'focus' : 'blur'));
  });
const menuItem = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === label,
  );

/**
 * Two idle sessions, aaaaaaaa shown at launch, and `unseen` finished unseen; `read` and `unread`
 * change what the looks show.
 */
async function setup(unseen: string[] = []) {
  const marked = new Set(unseen);
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope(
        ['aaaaaaaa', 'bbbbbbbb'].map((id) =>
          managedRow(id, { lastState: IDLE, ...(marked.has(id) ? { unread: true } : {}) }),
        ),
      ),
    read: (args) => {
      const id = args.at(-1) ?? '';
      marked.delete(id);
      return envelope({ id, unread: false });
    },
    unread: (args) => {
      const id = args.at(-1) ?? '';
      marked.add(id);
      return envelope({ id, unread: true });
    },
  });
  await renderWithMesa(<App />, bridge);
  const marks = () => calls.filter((args) => args[1] === 'read' || args[1] === 'unread');
  return { marks };
}

test('a finished session is unread until it is shown in a focused window', async () => {
  const { marks } = await setup(['bbbbbbbb']);
  // The session shown at launch in a focused window is read; the other is not.
  expect(card('aaaaaaaa')?.getAttribute('aria-current')).toBe('page');
  expect(unread('aaaaaaaa')).toBe(false);
  expect(unread('bbbbbbbb')).toBe(true);
  expect(card('bbbbbbbb')?.title).toContain('idle, unread');
  expect(card('bbbbbbbb')?.textContent).toContain('idle · unread');
  expect(marks()).toEqual([]);

  // Shown while Mesa is in the background: still unread.
  await windowFocus(false);
  await click(card('bbbbbbbb'));
  expect(unread('bbbbbbbb')).toBe(true);
  expect(marks()).toEqual([]);

  await windowFocus(true);
  expect(unread('bbbbbbbb')).toBe(false);
  expect(marks()).toEqual([['--json', 'read', '--', 'bbbbbbbb']]);
});

test('Cmd+Shift+U marks the shown session unread until another is shown; the menus mark too', async () => {
  const { marks } = await setup();
  await windowFocus(true);
  await click(card('aaaaaaaa'));
  expect(unread('aaaaaaaa')).toBe(false);

  await press(window.document.body, 'U', { metaKey: true, shiftKey: true });
  expect(unread('aaaaaaaa')).toBe(true);
  expect(marks().at(-1)).toEqual(['--json', 'unread', '--', 'aaaaaaaa']);
  // Shown and focused, it stays unread while it is shown.
  await windowFocus(true);
  expect(unread('aaaaaaaa')).toBe(true);
  expect(marks().filter((args) => args[1] === 'read')).toHaveLength(0);

  // The right-click menu marks a card that is not shown.
  await act(async () => {
    card('bbbbbbbb')?.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 80 }),
    );
  });
  await click(menuItem('Mark as unread'));
  expect(unread('bbbbbbbb')).toBe(true);
  expect(marks().at(-1)).toEqual(['--json', 'unread', '--', 'bbbbbbbb']);

  // Showing another session reads it; the one marked unread stays so.
  await click(card('bbbbbbbb'));
  expect(unread('bbbbbbbb')).toBe(false);
  expect(unread('aaaaaaaa')).toBe(true);
});
