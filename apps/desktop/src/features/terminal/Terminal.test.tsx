// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { DEFAULT_TERMINAL_PREFERENCES, TERMINAL_PRESETS } from '@mesa/core/browser';
import type { Terminal as Xterm } from '@xterm/xterm';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { attached, fakeBridge, fakePlatform, fakeTerminals, renderWithMesa } from '@/lib/testing';
import { Terminal } from './Terminal';

// Each xterm the component makes, so a test can read the options it was given.
const xterms = vi.hoisted(() => [] as Xterm[]);
vi.mock('@xterm/xterm', async (load) => {
  const xterm = await load<typeof import('@xterm/xterm')>();
  class Recorded extends xterm.Terminal {
    constructor(...args: ConstructorParameters<typeof xterm.Terminal>) {
      super(...args);
      xterms.push(this);
    }
  }
  return { ...xterm, Terminal: Recorded };
});

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

test('Cmd+C with nothing selected in xterm is taken and sends nothing to the pty', async () => {
  const terminals = fakeTerminals();
  const platform = fakePlatform({ terminal: terminals.host });
  await renderWithMesa(<Terminal sessionId="aaaaaaaa" focus />, fakeBridge().bridge, platform);
  await attached();
  const key = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    document.activeElement?.dispatchEvent(event);
    return event.defaultPrevented;
  };
  expect(key({ key: 'c', metaKey: true })).toBe(true);
  expect(terminals.calls.some((call) => call[0] === 'write')).toBe(false);
  // Paste stays the webview's own.
  expect(key({ key: 'v', metaKey: true })).toBe(false);
});

const withTheme = (theme: Config['terminal']['theme']): Config['terminal'] => ({
  ...DEFAULT_TERMINAL_PREFERENCES,
  app: 'Terminal',
  theme,
});

test('xterm gets all 20 colors of the palette', async () => {
  const platform = fakePlatform({ terminal: fakeTerminals().host });
  const ui = <Terminal sessionId="aaaaaaaa" preferences={withTheme('dracula')} />;
  await renderWithMesa(ui, fakeBridge().bridge, platform);
  await attached();
  expect(xterms.at(-1)?.options.theme).toEqual(TERMINAL_PRESETS.dracula.colors);
  expect(xterms.at(-1)?.options.theme?.red).toBe(TERMINAL_PRESETS.dracula.colors.red);
});

test('on follow, switching the interface theme recolors the open terminal', async () => {
  document.documentElement.dataset.theme = 'light';
  const platform = fakePlatform({ terminal: fakeTerminals().host });
  const ui = <Terminal sessionId="aaaaaaaa" preferences={withTheme('follow')} />;
  const byTestId = await renderWithMesa(ui, fakeBridge().bridge, platform);
  await attached();
  const term = xterms.at(-1);
  expect(term?.options.theme?.red).toBe(TERMINAL_PRESETS['mesa-light'].colors.red);
  await act(async () => {
    document.documentElement.dataset.theme = 'dark';
  });
  expect(term?.options.theme?.red).toBe(TERMINAL_PRESETS['mesa-dark'].colors.red);
  expect(byTestId('terminal-aaaaaaaa')[0]?.style.background).toBe(
    TERMINAL_PRESETS['mesa-dark'].colors.background,
  );
  delete document.documentElement.dataset.theme;
});
