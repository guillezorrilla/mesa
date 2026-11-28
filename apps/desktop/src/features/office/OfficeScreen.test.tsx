// @vitest-environment happy-dom

import { act } from 'react';
import { expect, test } from 'vitest';
import { asking, click, fakeBridge, managedRow, PROJECTS, renderWithMesa } from '@/lib/testing';
import { OfficeScreen } from './OfficeScreen';

const hover = (element: HTMLElement | undefined) =>
  act(async () => element?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));

test('each session sits in its project room, shows its state and subagents, reads out on hover and opens on click', async () => {
  const opened: string[] = [];
  const worker = managedRow('bbbbbbbb', {
    name: 'Chart shoals',
    progress: { text: 'Sounding the east channel', at: '2026-09-25T12:01:00.000Z' },
    activity: { kind: 'reading', tool: 'Read', at: '2026-09-25T12:01:00.000Z' },
    subagents: [{ id: 'agent-lantern', type: 'Explore', since: '2026-09-25T12:01:00.000Z' }],
    context: { used: 61, window: 200000, at: '2026-09-25T12:01:00.000Z', source: 'transcript' },
  });
  const elsewhere = managedRow('dddddddd', { project: 'tide' });
  const byTestId = await renderWithMesa(
    <OfficeScreen
      sessions={[asking, worker, elsewhere]}
      projects={PROJECTS}
      onSession={(id) => opened.push(id)}
    />,
    fakeBridge({}).bridge,
  );
  expect(byTestId('office-room').map((room) => room.getAttribute('aria-label'))).toEqual([
    'lantern-cove room',
    'tide room',
  ]);
  expect(byTestId('office-summary')[0]?.textContent).toBe('2 working · 1 need you · 0 resting');
  const agents = byTestId('office-agent');
  expect(
    agents.map((agent) => [agent.dataset.session, agent.dataset.state, agent.dataset.emote]),
  ).toEqual([
    ['aaaaaaaa', 'waiting-permission', 'alert'],
    ['bbbbbbbb', 'working', 'book'],
    ['dddddddd', 'working', 'dots'],
  ]);
  expect(agents[1]?.getAttribute('aria-label')).toBe('Open session Chart shoals: reading (Read)');
  expect(byTestId('office-subagents')[0]?.title).toBe('1 subagent: Explore');
  expect(agents[1]?.querySelector('[aria-label="Context used: 61%"]')).not.toBeNull();
  await hover(agents[1]);
  expect(byTestId('office-details')[0]?.textContent).toContain('Sounding the east channel');
  await click(agents[1]);
  expect(opened).toEqual(['bbbbbbbb']);
});

test('an empty board is an empty office', async () => {
  const byTestId = await renderWithMesa(
    <OfficeScreen sessions={[]} projects={[]} onSession={() => {}} />,
    fakeBridge({}).bridge,
  );
  expect(byTestId('office-screen')[0]?.textContent).toContain('Nobody is in.');
  expect(byTestId('office-room')).toHaveLength(0);
});
