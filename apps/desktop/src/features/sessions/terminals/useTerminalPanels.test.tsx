// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { KEPT_HIDDEN, useTerminalPanels } from './useTerminalPanels';

const IDS = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee', 'ffffffff'];
const rows = IDS.map((id) => managedRow(id));

/** Selects each session in turn (a click on its card), and shows the open panels. */
function Panels(props: { gridMode?: boolean }) {
  const [selected, setSelected] = useState<string>();
  const panels = useTerminalPanels(rows, selected, props.gridMode);
  return (
    <>
      {IDS.map((id) => (
        <button
          key={id}
          type="button"
          data-testid={`select-${id}`}
          onClick={() => setSelected(id)}
        />
      ))}
      <output data-testid="panels">{panels.panels.join(' ')}</output>
    </>
  );
}

async function selectEach(get: (id: string) => HTMLElement[]) {
  for (const id of IDS) await act(async () => get(`select-${id}`)[0]?.click());
  return get('panels')[0]?.textContent?.split(' ') ?? [];
}

test('selecting session after session keeps the selected terminal and the most recent hidden ones', async () => {
  const get = await renderWithMesa(<Panels />, fakeBridge().bridge);
  const open = await selectEach(get);
  expect(open).toEqual(IDS.slice(-(KEPT_HIDDEN + 1)));
  // Back to one that was closed: it opens again, and the oldest kept one goes.
  await act(async () => get('select-aaaaaaaa')[0]?.click());
  expect(get('panels')[0]?.textContent?.split(' ')).toEqual([
    ...IDS.slice(-KEPT_HIDDEN),
    'aaaaaaaa',
  ]);
});

test('in the Grid, whose tiles are the panels, none is closed', async () => {
  const get = await renderWithMesa(<Panels gridMode />, fakeBridge().bridge);
  expect(await selectEach(get)).toEqual(IDS);
});

test('a panel open while the Grid showed is not closed by later selections outside it', async () => {
  function Toggle() {
    const [grid, setGrid] = useState(true);
    const [selected, setSelected] = useState<string>();
    const panels = useTerminalPanels(rows, selected, grid);
    return (
      <>
        <button type="button" data-testid="leave" onClick={() => setGrid(false)} />
        {IDS.map((id) => (
          <button
            key={id}
            type="button"
            data-testid={`select-${id}`}
            onClick={() => setSelected(id)}
          />
        ))}
        <output data-testid="panels">{panels.panels.join(' ')}</output>
      </>
    );
  }
  const get = await renderWithMesa(<Toggle />, fakeBridge().bridge);
  await act(async () => get('select-aaaaaaaa')[0]?.click());
  await act(async () => get('leave')[0]?.click());
  const open = await selectEach(get);
  expect(open[0]).toBe('aaaaaaaa');
  expect(open).toHaveLength(KEPT_HIDDEN + 2);
});
