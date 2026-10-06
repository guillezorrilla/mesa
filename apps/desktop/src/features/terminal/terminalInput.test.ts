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
