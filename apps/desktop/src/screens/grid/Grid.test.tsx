// @vitest-environment happy-dom
import type { GridGroup } from '@mesa/core';
import { DEFAULT_BOARD_PREFERENCES, DEFAULT_SHORTCUTS } from '@mesa/core/browser';
import { act } from 'react';
import { expect, test } from 'vitest';
import { App } from '@/App';
import {
  choose,
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  fakeTerminals,
  managedRow,
  renderWithMesa,
} from '@/lib/testing';

test('grid project tabs, zoom and saved groups retain exact terminal clients', async () => {
  const terminals = fakeTerminals();
  let groups: GridGroup[] = [];
  const { bridge, calls } = fakeBridge({
    config: () =>
      envelope({
        shortcuts: DEFAULT_SHORTCUTS,
        board: DEFAULT_BOARD_PREFERENCES,
        grid: { groups },
      }),
    sessions: () => envelope([managedRow('aaaaaaaa'), managedRow('bbbbbbbb', { project: 'tide' })]),
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    'grid save': (args) => {
      const split = args.indexOf('--');
      const name = args[split + 1] as string;
      const project = args.includes('--project') ? args[args.indexOf('--project') + 1] : undefined;
      groups = [{ name, project, sessions: args.slice(split + 2) }];
      return envelope({ groups, receipt: null });
    },
    'grid remove': () => {
      groups = [];
      return envelope({ groups, receipt: null });
    },
  });
  const byTestId = await renderWithMesa(
    <App startOnBoard />,
    bridge,
    fakePlatform({ terminal: terminals.host }),
  );
  await click(byTestId('nav-grid')[0]);
  expect(byTestId('grid-toolbar')).toHaveLength(1);
  await choose(byTestId('grid-session-picker')[0], 'aaaaaaaa');
  await click(
    [...(byTestId('grid-toolbar')[0]?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Add tile'),
    ),
  );
  await act(async () => new Promise((done) => setTimeout(done, 20)));
  expect(terminals.calls.filter((call) => call[0] === 'open').map((call) => call[1])).toEqual([
    'aaaaaaaa',
  ]);

  await click(
    [
      ...(byTestId('grid-toolbar')[0]?.querySelectorAll<HTMLButtonElement>('button[role="tab"]') ??
        []),
    ].find((button) => button.textContent === 'tide'),
  );
  await choose(byTestId('grid-session-picker')[0], 'bbbbbbbb');
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === 'lantern-cove',
    ),
  );
  expect(
    [...(byTestId('grid-toolbar')[0]?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Add tile'),
    )?.disabled,
  ).toBe(true);
  await click(
    [...document.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(
      (button) => button.textContent === 'tide',
    ),
  );
  await click(
    [...(byTestId('grid-toolbar')[0]?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Open project sessions'),
    ),
  );
  await act(async () => new Promise((done) => setTimeout(done, 20)));
  expect(terminals.calls.filter((call) => call[0] === 'open').map((call) => call[1])).toEqual([
    'aaaaaaaa',
    'bbbbbbbb',
  ]);
  expect(byTestId('grid-tile')[0]?.hasAttribute('hidden')).toBe(true);
  await click(document.querySelector('[aria-label="Zoom bbbbbbbb"]') as HTMLElement);
  expect(byTestId('grid-tile')[1]?.className).toContain('h-[70vh]');
  await click(document.querySelector('[aria-label="Unzoom bbbbbbbb"]') as HTMLElement);
  expect(byTestId('grid-tile')[1]?.className).toContain('resize');
  expect(terminals.calls.filter((call) => call[0] === 'close')).toEqual([]);

  const name = byTestId('grid-group-name')[0] as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(name, 'Tide');
    name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const save = [...(byTestId('grid-toolbar')[0]?.querySelectorAll('button') ?? [])].find((button) =>
    button.textContent?.includes('Save group'),
  );
  expect(save?.disabled).toBe(false);
  await click(save);
  expect(groups).toEqual([{ name: 'Tide', project: 'tide', sessions: ['bbbbbbbb'] }]);
  const tile = byTestId('grid-tile')[1] as HTMLElement;
  await click(document.querySelector('[aria-label="Zoom bbbbbbbb"]') as HTMLElement);
  await click(tile.querySelector('[data-testid="close-terminal"]') as HTMLElement);
  expect(terminals.calls).toContainEqual(['close', 't2']);
  await click(
    [...(byTestId('grid-groups')[0]?.querySelectorAll('button') ?? [])].find((button) =>
      button.textContent?.includes('Tide'),
    ),
  );
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(byTestId('grid-tile')[0]?.className).toContain('resize');
  expect(byTestId('terminal-aaaaaaaa')).toHaveLength(0);
  expect(terminals.calls).toContainEqual(['close', 't1']);
  expect(terminals.calls.filter((call) => call[0] === 'open').map((call) => call[1])).toEqual([
    'aaaaaaaa',
    'bbbbbbbb',
    'bbbbbbbb',
  ]);
  await click(byTestId('nav-board')[0]);
  await click(byTestId('nav-grid')[0]);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  await click(document.querySelector('[aria-label="Remove Tide"]') as HTMLElement);
  expect(groups).toHaveLength(1);
  await click(document.querySelector('[aria-label="Confirm remove Tide"]') as HTMLElement);
  expect(groups).toHaveLength(0);
  expect(byTestId('terminal-bbbbbbbb')).toHaveLength(1);
  expect(
    calls.some((args) => args.join(' ').includes('grid save --project tide -- Tide bbbbbbbb')),
  ).toBe(true);
});
