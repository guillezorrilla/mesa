// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { attached, fakeBridge, fakePlatform, fakeTerminals, renderWithMesa } from '@/lib/testing';
import { Terminal } from './Terminal';

/** Whether the keyboard is in the terminal: xterm's input field has focus. */
const focused = () => Boolean(document.activeElement?.closest('.terminal-host'));

test('the session in view takes the keyboard once attached; another stays put', async () => {
  const terminals = fakeTerminals();
  const platform = fakePlatform({ terminal: terminals.host });
  await renderWithMesa(<Terminal sessionId="aaaaaaaa" />, fakeBridge().bridge, platform);
  await attached();
  expect(terminals.calls.some((call) => call[0] === 'ready')).toBe(true);
  expect(focused()).toBe(false);
  await renderWithMesa(<Terminal sessionId="bbbbbbbb" focus />, fakeBridge().bridge, platform);
  await attached();
  expect(focused()).toBe(true);
});
