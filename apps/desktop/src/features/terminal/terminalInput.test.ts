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
