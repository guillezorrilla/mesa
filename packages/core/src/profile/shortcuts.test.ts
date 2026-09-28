import { expect, test } from 'vitest';
import { shortcutFromKeys, validShortcut } from './shortcuts.js';

test('the app and config agree on canonical keys and reserved combinations', () => {
  expect(
    shortcutFromKeys({ key: 'p', metaKey: true, ctrlKey: false, shiftKey: true, altKey: false }),
  ).toBe('Mod+Shift+P');
  expect(
    shortcutFromKeys({ key: 'q', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false }),
  ).toBeUndefined();
  expect(validShortcut('Mod+Shift+P')).toBe(true);
  expect(validShortcut('Mod+Q')).toBe(false);
});
