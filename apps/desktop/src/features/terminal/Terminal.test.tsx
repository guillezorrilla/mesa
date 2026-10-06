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

test('Cmd+C with nothing selected in xterm is taken, so macOS does not beep at a disabled Copy', async () => {
  const platform = fakePlatform({ terminal: fakeTerminals().host });
  await renderWithMesa(<Terminal sessionId="aaaaaaaa" focus />, fakeBridge().bridge, platform);
  await attached();
  const key = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    document.activeElement?.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(key({ key: 'c', metaKey: true })).toBe(true);
  // Paste stays the webview's own.
  expect(key({ key: 'v', metaKey: true })).toBe(false);
});
