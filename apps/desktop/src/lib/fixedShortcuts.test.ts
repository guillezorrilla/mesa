import { expect, test } from 'vitest';
import { keyCaps, pressed } from './fixedShortcuts';

const keys = (key: string, mods: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', boolean>>) => ({
  key,
  metaKey: Boolean(mods.meta),
  ctrlKey: Boolean(mods.ctrl),
  shiftKey: Boolean(mods.shift),
  altKey: Boolean(mods.alt),
});

test('a shortcut matches its exact modifiers, Command or Control as Mod', () => {
  expect(pressed(keys('p', { meta: true }), 'Mod+P')).toBe(true);
  expect(pressed(keys('P', { ctrl: true }), 'Mod+P')).toBe(true);
  expect(pressed(keys('p', { meta: true, shift: true }), 'Mod+P')).toBe(false);
  expect(pressed(keys('F', { meta: true, shift: true }), 'Mod+Shift+F')).toBe(true);
  expect(pressed(keys('f', { meta: true, alt: true, shift: true }), 'Mod+Shift+F')).toBe(false);
  expect(pressed(keys('/', { meta: true }), 'Mod+/')).toBe(true);
  expect(pressed(keys('/', {}), 'Mod+/')).toBe(false);
});

test('key caps read as a Mac prints them', () => {
  expect(keyCaps('Mod+Shift+Alt+k')).toEqual(['⌘', '⇧', '⌥', 'K']);
});
