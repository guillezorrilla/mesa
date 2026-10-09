// @vitest-environment happy-dom
import type { FollowedView, Ticket } from '@mesa/core';
import { expect, test } from 'vitest';
import { choose, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const ticket = (key: string, summary: string, extra: Partial<Ticket> = {}): Ticket => ({
  key,
  summary,
  status: 'To Do',
  category: 'new',
  url: `https://lantern-cove.atlassian.net/browse/${key}`,
  site: 'cloud-1',
  mine: false,
  views: ['sprint'],
  sessions: [],
  ...extra,
});
const sprint: FollowedView = {
  name: 'sprint',
  describe: 'Current sprint of board Tide team (only mine, not done)',
  sprints: ['Tide 7'],
};
const listOf = (views: FollowedView[], tickets: Ticket[]) =>
  envelope({
    project: 'lantern-cove',
    prompt: 'Ticket flow',
    projectPrompt: null,
    defaults: { notes: false, assign: true, start: 'worktree' },
    views,
    tickets,
  });
const shown = (key: string, extra: object = {}) =>
  envelope({
    key,
    summary: 'Show the next high tide',
    labels: ['frontend'],
    description: 'Harbor staff ask for **the next high tide**.',
    comments: [
      {
        author: 'Ash Pier',
        created: '2026-09-23T10:00:00.000Z',
        markdown: 'Use the wind card style.',
      },
    ],
    url: `https://lantern-cove.atlassian.net/browse/${key}`,
    site: 'cloud-1',
    mine: false,
    sessions: [],
    ...extra,
  });
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
const words = (calls: string[][]) => calls.map((args) => args.slice(1).join(' '));

test('the list groups tickets by status, and the panel shows the ticket whole and assigns it', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      listOf(
        [sprint],
        [
          ticket('LC-1', 'Retry the tide feed', {
            category: 'indeterminate',
            status: 'In Progress',
            assignee: 'Mira Keel',
            sessions: [{ id: 'aaaaaaaa', project: 'harbor-gate' }],
          }),
          ticket('LC-2', 'Show the next high tide'),
        ],
      ),
    'tickets show': (args) => shown(String(args.at(-1))),
    'tickets assign': () => envelope({ key: 'LC-2', assignee: 'Rowan Tide', receipt: null }),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const groups = [...document.querySelectorAll('[role="listbox"] [aria-expanded]')].map(
    (g) => g.textContent,
  );
  expect(groups).toEqual(['In progress1', 'To do1']);
  expect(byTestId('ticket-row')[0]?.textContent).toContain('LC-1Retry the tide feedLive');
  expect(byTestId('view-switcher')[0]?.textContent).toContain('sprintTide 7');

  await click(byTestId('ticket-row')[1]);
  const panel = () => byTestId('ticket-panel')[0]?.textContent ?? '';
  expect(panel()).toContain('Show the next high tide');
  expect(panel()).toContain('Harbor staff ask for the next high tide.');
  expect(panel()).toContain('Use the wind card style.');
  expect(panel()).toContain('SprintTide 7');
  await click(button('Assign to me'));
  expect(words(calls)).toContain('tickets assign -- LC-2');
});

test('Start session assigns, imports, and starts in a worktree on the ticket branch, then opens it', async () => {
  const opened: string[] = [];
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([sprint], [ticket('LC-2', 'Show the next high tide')]),
    'tickets show': (args) => shown(String(args.at(-1))),
    'tickets assign': () => envelope({ key: 'LC-2', assignee: 'Rowan Tide', receipt: null }),
    prompts: () =>
      envelope([
        { name: 'Ticket flow', text: '/goal Deliver the ticket below.' },
        { name: 'Hotfix flow', text: '/goal Fix it fast.' },
      ]),
    import: () => envelope({ project: 'lantern-cove', items: [], receipt: null }),
    'import goal': () =>
      envelope({
        source: 'jira',
        id: 'LC-2',
        title: 'LC-2: Show',
        goal: '/goal Fix it fast.\n\nWork on LC-2',
      }),
    open: () => envelope({ id: 'bbbbbbbb', project: 'lantern-cove', receipt: null }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={(id) => opened.push(id)} />,
    bridge,
  );
  await click(byTestId('start-ticket')[0]);
  const sheet = () => byTestId('start-sheet')[0]?.textContent ?? '';
  expect(sheet()).toContain('Assign LC-2 to me');
  expect(sheet()).toContain('New worktree on lc-2');
  await choose(document.getElementById('start-prompt') ?? undefined, 'Hotfix flow');
  await click(button('Start session'));
  const started = words(calls).filter((w) => /^(tickets assign|import|open)/.test(w));
  expect(started).toEqual([
    'tickets assign -- LC-2',
    'import --project lantern-cove --no-notes -- https://lantern-cove.atlassian.net/browse/LC-2',
    'import goal --project lantern-cove --prompt=Hotfix flow -- LC-2',
    'open --from=LC-2 --exact-goal --no-parent --goal=/goal Fix it fast.\n\nWork on LC-2 --branch=lc-2 -- lantern-cove',
  ]);
  expect(byTestId('start-progress')[0]?.textContent).toContain(
    'Start the session in a new worktree on lc-2',
  );
  await click(button('Open session'));
  expect(opened).toEqual(['bbbbbbbb']);
});

test('Follow picks a board, counts its tickets live, then adds the view and follows it', async () => {
  let followed = false;
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf(followed ? [sprint] : [], []),
    prompts: () => envelope([]),
    'tickets views': () =>
      envelope([{ ...sprint, site: 'cloud-1', board: 42, following: ['harbor-gate'] }]),
    'tickets boards': () =>
      envelope({
        site: { id: 'cloud-1', name: 'lantern-cove' },
        boards: [
          { id: 41, name: 'Harbor team', type: 'scrum' },
          { id: 42, name: 'Tide team', type: 'scrum', project: 'LC' },
        ],
      }),
    'tickets preview': () =>
      envelope({ describe: 'x', jql: '(sprint = 7) ORDER BY Rank ASC', count: 3, more: false }),
    'tickets views add': () => envelope({ name: 'Tide team sprint', describe: 'x' }),
    'tickets follow': () => {
      followed = true;
      return envelope({ project: 'lantern-cove', following: ['Tide team sprint'] });
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('See your sprint here');
  await click(button('Follow a view'));
  const dialog = () => byTestId('follow-view-dialog')[0]?.textContent ?? '';
  // The board view another project follows can be followed in one click.
  expect(dialog()).toContain('Views you already have');
  await click(document.getElementById('view-pick-42') ?? undefined);
  expect(dialog()).toContain('3 tickets right now, shown as "Tide team sprint"');
  await click(byTestId('confirm-follow-view')[0]);
  expect(
    words(calls).filter((w) => w.startsWith('tickets views add') || w.startsWith('tickets follow')),
  ).toEqual([
    'tickets views add --board 42 --sprint current -- Tide team sprint',
    'tickets follow -- lantern-cove Tide team sprint',
  ]);
  expect(byTestId('follow-view-dialog')).toHaveLength(0);
});

test('a view that needs a fresh sign-in says so and offers Reconnect', async () => {
  const { bridge } = fakeBridge({
    tickets: () =>
      listOf(
        [{ name: 'boards', describe: 'x', error: 'needs reconnecting', connect: 'atlassian' }],
        [],
      ),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain(
    'Mesa needs a fresh sign-in to read boards from Jira.',
  );
  expect(button('Reconnect Atlassian')).toBeDefined();
});
