import { terminalPalette } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { terminalPage } from './terminalPage';

test('the page carries xterm and its bridge, in the palette, the theme safe inside its script', () => {
  const palette = terminalPalette({ theme: 'follow' }, true);
  const page = terminalPage({ ...palette, cursor: '</script>' });
  expect(page).toContain(`background:${palette.background}`);
  expect(page).toContain('new Terminal(');
  // The theme's JSON can never end its script early.
  expect(page).toContain('"cursor":"\\u003c/script>"');
});
