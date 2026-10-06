import { expect, test } from 'vitest';
import { terminalInputForKey } from './terminalInput';

const settings = { extraSubmitKey: 'cmd-enter', newlineKey: 'shift-enter' } as const;
const enter = {
  type: 'keydown',
  key: 'Enter',
  keyCode: 13,
  isComposing: false,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
};

test('only configured Enter modifiers send bytes; native Enter and IME remain native', () => {
  expect(terminalInputForKey(enter, settings)).toBeNull();
  expect(terminalInputForKey({ ...enter, metaKey: true }, settings)).toBe('\r');
  expect(terminalInputForKey({ ...enter, shiftKey: true }, settings)).toBe('\n');
  expect(terminalInputForKey({ ...enter, ctrlKey: true }, settings)).toBeNull();
  expect(terminalInputForKey({ ...enter, metaKey: true, isComposing: true }, settings)).toBeNull();
  expect(terminalInputForKey({ ...enter, shiftKey: true, keyCode: 229 }, settings)).toBeNull();
  expect(terminalInputForKey({ ...enter, metaKey: true, type: 'keyup' }, settings)).toBeNull();
  expect(
    terminalInputForKey({ ...enter, metaKey: true }, { ...settings, extraSubmitKey: 'none' }),
  ).toBeNull();
});

test('Cmd+C with nothing selected in xterm is swallowed; a selection, or other modifiers, keep it native', () => {
  const copy = { ...enter, key: 'c', keyCode: 67, metaKey: true };
  expect(terminalInputForKey(copy, settings)).toBe('');
  expect(terminalInputForKey({ ...copy, key: 'C' }, settings)).toBe('');
  expect(terminalInputForKey(copy, settings, true)).toBeNull();
  expect(terminalInputForKey({ ...copy, shiftKey: true }, settings)).toBeNull();
  expect(terminalInputForKey({ ...copy, type: 'keyup' }, settings)).toBeNull();
  expect(terminalInputForKey({ ...copy, key: 'v' }, settings)).toBeNull();
});

test('Cmd and Option arrows and Backspace edit the line as macOS terminals do', () => {
  const press = (key: string, modifiers: Partial<typeof enter>) =>
    terminalInputForKey({ ...enter, key, keyCode: 0, ...modifiers }, settings);
  expect(press('ArrowLeft', { metaKey: true })).toBe('\x01');
  expect(press('ArrowRight', { metaKey: true })).toBe('\x05');
  expect(press('Backspace', { metaKey: true })).toBe('\x15');
  expect(press('ArrowLeft', { altKey: true })).toBe('\x1bb');
  expect(press('ArrowRight', { altKey: true })).toBe('\x1bf');
  // Plain, shifted, or with another modifier too, the key stays xterm's.
  expect(press('ArrowLeft', {})).toBeNull();
  expect(press('ArrowLeft', { metaKey: true, shiftKey: true })).toBeNull();
  expect(press('Backspace', { altKey: true })).toBeNull();
  expect(press('ArrowRight', { metaKey: true, altKey: true })).toBeNull();
  expect(press('Backspace', { metaKey: true, ctrlKey: true })).toBeNull();
  expect(press('ArrowLeft', { metaKey: true, isComposing: true })).toBeNull();
  expect(press('constructor', { metaKey: true })).toBeNull();
});
