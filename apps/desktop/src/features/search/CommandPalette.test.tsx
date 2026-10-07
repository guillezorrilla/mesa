// @vitest-environment happy-dom
import { DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { expect, test } from 'vitest';
import { App } from '@/app/App';
import {
  click,
  envelope,
  fakeBridge,
  managedRow,
  PROJECTS,
  press,
  renderWithMesa,
  searchFor,
} from '@/lib/testing';

/** A window-wide key, as the app's global shortcuts hear it. */
const pressKey = ({ key = '', ...keys }: KeyboardEventInit) => press(document.body, key, keys);
const keyOnQuery = (key: string) =>
  press(document.querySelector('[data-testid="palette-query"]'), key);
const palette = () => document.querySelector<HTMLElement>('[data-testid="command-palette"]');
const rows = () => [
  ...(palette()?.querySelectorAll<HTMLElement>('[data-testid="palette-hit"]') ?? []),
];
const row = (value: string) => rows().find((hit) => hit.dataset.value === value);
const at = (iso: string, state: 'working' | 'idle' | 'done') => ({
  lastState: { state, confidence: 0.9, at: iso, source: 'hook' as const },
});
const SESSIONS = [
  managedRow('aaaaaaaa', at('2026-09-25T12:00:00.000Z', 'working')),
  managedRow('bbbbbbbb', at('2026-09-25T13:00:00.000Z', 'idle')),
  managedRow('cccccccc', at('2026-09-25T14:00:00.000Z', 'done')),
];

test('typing selects the best match first, and Enter opens it', async () => {
  const byTestId = await renderWithMesa(
    <App />,
    fakeBridge({ projects: () => envelope(PROJECTS) }).bridge,
  );
  await pressKey({ key: 'k', metaKey: true });
  expect(palette()?.dataset.mode).toBe('all');
  expect((byTestId('palette-query')[0] as HTMLInputElement).getAttribute('placeholder')).toBe(
    'Search commands, settings, projects, sessions...',
  );
  await searchFor('grid');
  expect(rows()[0]?.dataset.value).toBe('navigation:grid');
  expect(rows()[0]?.getAttribute('aria-selected')).toBe('true');
  await keyOnQuery('Enter');
  expect(byTestId('command-palette')).toHaveLength(0);
  expect(byTestId('grid-toolbar')).toHaveLength(1);
});

test('a row triggered by a key shows it, rebound keys included', async () => {
  const shortcuts = { ...DEFAULT_SHORTCUTS, switchSession: 'Mod+Shift+J' };
  await renderWithMesa(
    <App />,
    fakeBridge({
      projects: () => envelope(PROJECTS),
      config: () => envelope({ defaultAgent: 'claude', shortcuts }),
    }).bridge,
  );
  await pressKey({ key: 'k', metaKey: true });
  const caption = (value: string) =>
    row(value)
      ?.querySelector('[data-testid="palette-shortcut"] [role="img"]')
      ?.getAttribute('aria-label');
  expect(caption('action:new-session')).toBe('Mod+N');
  expect(caption('action:switch-session')).toBe('Mod+Shift+J');
  expect(caption('action:shortcuts')).toBe('Mod+/');
  expect(row('action:switch-session')?.textContent).toContain('⌘⇧J');
  // Keyboard shortcuts lists it, where it can be rebound.
  await pressKey({ key: 'Escape' });
  await pressKey({ key: '/', metaKey: true });
  const settings = document.querySelector('[data-testid="shortcut-settings"]');
  expect(settings?.textContent).toContain('Switch session');
  expect(settings?.querySelector('[aria-label="Mod+Shift+J"]')).not.toBeNull();
  expect(document.querySelector('[aria-label="Customize Switch session"]')).not.toBeNull();
});

test('a disabled hit renders muted and cannot be chosen', async () => {
  const { bridge, calls } = fakeBridge();
  await renderWithMesa(<App />, bridge);
  await pressKey({ key: 'k', metaKey: true });
  const start = row('action:new-session');
  expect(start?.getAttribute('aria-disabled')).toBe('true');
  expect(start?.textContent).toContain('Add a project first');
  await click(start);
  expect(palette()).not.toBeNull();
  expect(calls.some((call) => call.includes('open'))).toBe(false);
});

test('the switcher lists open sessions by last activity; Backspace on no text leaves it', async () => {
  await renderWithMesa(
    <App />,
    fakeBridge({
      projects: () => envelope(PROJECTS),
      sessions: () => envelope(SESSIONS),
    }).bridge,
  );
  await pressKey({ key: 'K', metaKey: true, shiftKey: true });
  expect(palette()?.dataset.mode).toBe('sessions');
  expect(document.querySelector('[data-testid="palette-query"]')?.getAttribute('placeholder')).toBe(
    'Switch to a session...',
  );
  expect(rows().map((hit) => hit.dataset.value)).toEqual(['session:bbbbbbbb', 'session:aaaaaaaa']);
  expect(
    rows().map((hit) => hit.querySelector('[data-testid="session-state"]')?.textContent),
  ).toEqual(['idle', 'working']);
  await keyOnQuery('Backspace');
  expect(palette()?.dataset.mode).toBe('all');
  expect(row('navigation:grid')).toBeDefined();
  // Choosing Switch session opens the switcher too.
  await click(row('action:switch-session'));
  expect(palette()?.dataset.mode).toBe('sessions');
  // Typed text finds an ended one, below the open ones.
  await searchFor('lantern');
  expect(rows().map((hit) => hit.dataset.value)).toEqual([
    'session:bbbbbbbb',
    'session:aaaaaaaa',
    'session:cccccccc',
  ]);
});
