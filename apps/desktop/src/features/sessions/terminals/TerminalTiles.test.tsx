// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { fakeBridge, fakePlatform, fakeTerminals, renderWithMesa } from '@/lib/testing';
import { TerminalTiles } from './TerminalTiles';
import type { TerminalPanels } from './useTerminalPanels';

const attached = () => act(async () => new Promise((done) => setTimeout(done, 20)));

/** Two open panels; the button selects the other one, as a click on its session card does. */
function Switcher() {
  const [selected, setSelected] = useState('aaaaaaaa');
  const panels = { panels: ['aaaaaaaa', 'bbbbbbbb'], liveRows: [] } as unknown as TerminalPanels;
  return (
    <>
      <button type="button" data-testid="switch" onClick={() => setSelected('bbbbbbbb')} />
      <TerminalTiles
        panels={panels}
        selectedSession={selected}
        gridProject="all"
        acting={false}
        onWebLink={() => {}}
        onOpenTerminal={() => {}}
        onReviewResponse={() => {}}
      />
    </>
  );
}

test('selecting another open session puts the keyboard in its terminal', async () => {
  const platform = fakePlatform({ terminal: fakeTerminals().host });
  const get = await renderWithMesa(<Switcher />, fakeBridge().bridge, platform);
  await attached();
  const [first, second] = [...document.querySelectorAll('.terminal-host')];
  expect(first?.contains(document.activeElement)).toBe(true);
  await act(async () => get('switch')[0]?.click());
  expect(second?.contains(document.activeElement)).toBe(true);
});
