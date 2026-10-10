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
    defaults: { notes: false, assign: true, start: 'worktree', untilDone: true },
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
const atlassian = (status: 'connected' | 'needs-reconnect' | 'disconnected') => ({
  id: 'atlassian',
  label: 'Atlassian',
  connected: status !== 'disconnected',
  status,
});
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
  // On by default: the session starts as Claude Code's /goal, held to finishing the ticket.
  expect(sheet()).toContain('Keep working until done');
  expect((document.getElementById('start-until-done') as HTMLElement).dataset.state).toBe(
    'checked',
  );
  await choose(document.getElementById('start-prompt') ?? undefined, 'Hotfix flow');
  await click(button('Start session'));
  const started = words(calls).filter((w) => /^(tickets assign|import|open)/.test(w));
  expect(started).toEqual([
    'tickets assign -- LC-2',
    'import --project lantern-cove --no-notes -- https://lantern-cove.atlassian.net/browse/LC-2',
    'import goal --project lantern-cove --prompt=Hotfix flow --until-done -- LC-2',
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
    'sources list': () => envelope({ sources: [atlassian('connected')] }),
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
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Pick the Jira tickets to show here');
  await click(button('Follow a Jira view'));
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

test('a board list the sign-in lacks scopes for offers Reconnect, which signs in and lists them', async () => {
  let scoped = false;
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([], []),
    prompts: () => envelope([]),
    'tickets views': () => envelope([]),
    'tickets boards': () =>
      scoped
        ? envelope({
            site: { id: 'cloud-1', name: 'lantern-cove' },
            boards: [{ id: 42, name: 'Tide team', type: 'scrum' }],
          })
        : {
            ok: false,
            error: {
              code: 'invalid_config',
              message:
                'Atlassian needs reconnecting to allow this: run mesa sources connect atlassian',
              details: { connect: 'atlassian' },
            },
          },
    'tickets preview': () =>
      envelope({ describe: 'x', jql: '(sprint = 7) ORDER BY Rank ASC', count: 3, more: false }),
    'sources list': () => envelope({ sources: [atlassian('connected')] }),
    'sources connect': () => {
      scoped = true;
      return envelope(atlassian('connected'));
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(button('Follow a Jira view'));
  expect(byTestId('source-error')[0]?.textContent).toContain('Atlassian needs reconnecting');
  await click(button('Reconnect'));
  expect(words(calls)).toContain('sources connect atlassian');
  expect(byTestId('source-error')).toHaveLength(0);
  expect(document.getElementById('view-pick-42')).not.toBeNull();
});

test('with no view and Jira not connected, the tab names Jira and signs in with Atlassian first', async () => {
  let status: 'connected' | 'disconnected' = 'disconnected';
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([], []),
    'sources list': () => envelope({ sources: [atlassian(status)] }),
    'sources connect': () => {
      status = 'connected';
      return envelope(atlassian(status));
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Bring your Jira sprint into Mesa');
  expect(button('Follow a Jira view')).toBeUndefined();
  await click(button('Connect Jira'));
  expect(words(calls)).toContain('sources connect atlassian');
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Signed in with Atlassian');
  expect(button('Follow a Jira view')).toBeDefined();
});

test('with no view and an expired Atlassian sign-in, the tab offers Reconnect Jira', async () => {
  const { bridge } = fakeBridge({
    tickets: () => listOf([], []),
    'sources list': () => envelope({ sources: [atlassian('needs-reconnect')] }),
  });
  await renderWithMesa(<TicketsTab project="lantern-cove" onSession={() => {}} />, bridge);
  expect(button('Reconnect Jira')).toBeDefined();
  expect(button('Follow a Jira view')).toBeUndefined();
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
