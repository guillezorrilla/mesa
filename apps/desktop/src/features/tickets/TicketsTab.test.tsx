// @vitest-environment happy-dom
import type { FollowedView, Ticket } from '@mesa/core';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const ticket = (key: string, summary: string, extra: Partial<Ticket> = {}): Ticket => ({
  key,
  summary,
  status: 'In Progress',
  done: false,
  assignee: 'Rowan Tide',
  url: `https://lantern-cove.atlassian.net/browse/${key}`,
  site: 'cloud-1',
  views: ['sprint'],
  sessions: [],
  ...extra,
});
const sprint: FollowedView = {
  name: 'sprint',
  describe: 'Current sprint of board Tide team (only mine, not done)',
  sprints: ['Tide 7'],
};
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );

test('the tab lists followed views and their tickets, says how to fix a view, and starts a session from a ticket', async () => {
  const started: string[] = [];
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      envelope({
        project: 'lantern-cove',
        prompt: 'Ticket flow',
        projectPrompt: null,
        views: [
          sprint,
          {
            name: 'next',
            describe: 'Next sprint of board Tide team (only mine, not done)',
            error: 'Atlassian needs reconnecting to allow this: run mesa sources connect atlassian',
            connect: 'atlassian',
          },
        ],
        tickets: [
          ticket('LC-1', 'Fix the tide alarm', {
            sessions: [{ id: 'aaaaaaaa', project: 'harbor-gate' }],
          }),
          ticket('LC-2', 'Chart the shoals'),
        ],
      }),
    prompts: () => envelope([{ name: 'Ticket flow', text: 'Branch, test first, open a PR.' }]),
    import: () => envelope({ project: 'lantern-cove', items: [], receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab
      project="lantern-cove"
      notes={false}
      onNotesChange={() => {}}
      onStartSession={(from) => started.push(from)}
    />,
    bridge,
  );
  const tab = () => byTestId('tickets-tab')[0]?.textContent ?? '';
  expect(tab()).toContain('sprintTide 7');
  expect(tab()).toContain('next: Atlassian needs reconnecting');
  expect(button('Reconnect Atlassian')).toBeDefined();
  const rows = byTestId('ticket-row').map((row) => row.textContent);
  expect(rows[0]).toContain('LC-1Fix the tide alarmRunning in harbor-gateIn Progress');
  expect(rows[1]).not.toContain('Running in');
  // The default prompt is in force: this project's own says it uses the default.
  expect(
    (document.querySelector('[aria-label="Default ticket prompt"]') as HTMLSelectElement).value,
  ).toBe('Ticket flow');

  await click(button('Start session from LC-2'));
  expect(calls.find((args) => args[1] === 'import')).toEqual([
    '--json',
    'import',
    '--project',
    'lantern-cove',
    '--no-notes',
    '--',
    'https://lantern-cove.atlassian.net/browse/LC-2',
  ]);
  expect(started).toEqual(['LC-2']);
});

test("Follow defines a board's current sprint as a view, then follows it", async () => {
  let followed = false;
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      envelope({
        project: 'lantern-cove',
        prompt: null,
        projectPrompt: null,
        views: followed ? [sprint] : [],
        tickets: [],
      }),
    prompts: () => envelope([]),
    'tickets views': () => envelope([]),
    'tickets boards': () =>
      envelope({
        site: { id: 'cloud-1', name: 'lantern-cove' },
        boards: [
          { id: 41, name: 'Harbor team', type: 'scrum' },
          { id: 42, name: 'Tide team', type: 'scrum', project: 'LC' },
        ],
      }),
    'tickets views add': () => envelope({ name: 'sprint', site: 'cloud-1', board: 42 }),
    'tickets follow': () => {
      followed = true;
      return envelope({ project: 'lantern-cove', following: ['sprint'] });
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" notes onNotesChange={() => {}} onStartSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain("Follow a board's sprint");
  await click(button('Follow'));
  const dialog = byTestId('follow-view-dialog')[0];
  expect(dialog).toBeDefined();
  await fill('ticket-view-search', 'team');
  await click(button('Search'));
  await choose(document.querySelector('[aria-label="Board"]') as HTMLElement, '42');
  await fill('ticket-view-name', 'sprint');
  await click(byTestId('confirm-follow-view')[0]);
  expect(calls.filter((args) => args[1] === 'tickets' && args[2] !== '--')).toEqual([
    ['--json', 'tickets', 'views'],
    ['--json', 'tickets', 'boards', '--search', 'team'],
    ['--json', 'tickets', 'views', 'add', '--board', '42', '--sprint', 'current', '--', 'sprint'],
    ['--json', 'tickets', 'follow', '--', 'lantern-cove', 'sprint'],
  ]);
  expect(byTestId('follow-view-dialog')).toHaveLength(0);
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('sprintTide 7');
});
