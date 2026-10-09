// @vitest-environment happy-dom
import type { Config } from '@mesa/core';
import { TERMINAL_PRESETS } from '@mesa/core/browser';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { SettingsDialog } from '../SettingsDialog';

/** Settings over a profile whose config takes each `config set`, as the CLI would. */
async function renderSettings() {
  const config = ((await fakeBridge().bridge(['--json', 'config'])) as { data: Config }).data;
  const terminal: Record<string, unknown> = config.terminal;
  const { bridge, calls } = fakeBridge({
    config: () => envelope(config),
    'config set': (args) => {
      const [path, value] = args.slice(-2) as [string, string];
      terminal[path.replace('terminal.', '')] = JSON.parse(value);
      return envelope({ path, value: JSON.parse(value) });
    },
  });
  const byTestId = await renderWithMesa(
    <SettingsDialog
      open
      onOpenChange={() => {}}
      doctorBusy={false}
      onRecheck={() => {}}
      onNavigate={() => {}}
      onReplayTour={() => {}}
      onChanged={() => {}}
    />,
    bridge,
  );
  const sets = () =>
    calls
      .filter((args) => args[2] === 'set')
      .map((args) => [args.at(-2), JSON.parse(args.at(-1) as string)]);
  const card = (id: string) => byTestId(`terminal-palette-${id}`)[0];
  const pressed = () =>
    [...document.querySelectorAll('[data-testid^="terminal-palette-"][aria-pressed="true"]')].map(
      (el) => el.getAttribute('data-testid'),
    );
  const preview = () => byTestId('terminal-palette-preview')[0]?.style.background;
  return { byTestId, sets, card, pressed, preview };
}

test('the palette section shows Follow, 12 presets and Custom, and a preset click saves its theme', async () => {
  const { card, sets, pressed, preview } = await renderSettings();
  expect(
    document.querySelectorAll('[data-testid^="terminal-palette-"][aria-pressed]'),
  ).toHaveLength(14);
  expect(pressed()).toEqual(['terminal-palette-follow']);
  expect(preview()).toBe(TERMINAL_PRESETS['mesa-light'].colors.background);
  await click(card('gruvbox-dark'));
  expect(sets()).toEqual([['terminal.theme', 'gruvbox-dark']]);
  expect(pressed()).toEqual(['terminal-palette-gruvbox-dark']);
  expect(preview()).toBe(TERMINAL_PRESETS['gruvbox-dark'].colors.background);
});

test('editing a color saves all 20 as Custom, and leaving Custom asks first', async () => {
  const { byTestId, card, sets, pressed } = await renderSettings();
  await click(card('dracula'));
  const red = byTestId('terminal-color-red')[0] as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(red, '#123456');
    red.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(pressed()).toEqual(['terminal-palette-custom']);
  await act(() => new Promise((resolve) => setTimeout(resolve, 400)));
  const colors = { ...TERMINAL_PRESETS.dracula.colors, red: '#123456' };
  expect(sets().slice(1)).toEqual([
    ['terminal.colors', colors],
    ['terminal.theme', 'custom'],
  ]);

  await click(card('tokyo-night'));
  expect(sets()).toHaveLength(3);
  expect(byTestId('terminal-palette-confirm')).toHaveLength(1);
  await click(byTestId('terminal-palette-confirm-submit')[0]);
  expect(sets().at(-1)).toEqual(['terminal.theme', 'tokyo-night']);
  expect(pressed()).toEqual(['terminal-palette-tokyo-night']);
});
