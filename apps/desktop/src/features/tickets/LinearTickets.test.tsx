// @vitest-environment happy-dom
import type { Ticket } from '@mesa/core';
import { beforeEach, expect, test } from 'vitest';
import { click, envelope, failure, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const cycleView = {
  name: 'Harbour cycle',
  describe: 'Harbour, current cycle, assigned to me',
  sprints: ['Cycle 4'],
};
const HARBOUR = { id: 'team-har', key: 'HAR', name: 'Harbour', color: '#5e6ad2' };
const PIER = { id: 'team-pier', key: 'PIER', name: 'Pier' };

const issue = (key: string, summary: string, extra: Partial<Ticket> = {}): Ticket => ({
  id: `linear:${key}`,
  provider: 'linear',
  key,
  summary,
  status: 'Todo',
  category: 'new',
  url: `https://linear.app/lantern-cove/issue/${key}`,
  mine: false,
  views: ['Harbour cycle'],
  sessions: [],
  ...extra,
});
const listOf = (tickets: Ticket[], views = [cycleView]) =>
  envelope({
    project: 'lantern-cove',
    tracker: 'linear',
    prompt: null,
    projectPrompt: null,
    defaults: { notes: false, assign: true, start: 'worktree' },
    views,
    tickets,
  });
const shown = envelope({
  id: 'linear:HAR-21',
  provider: 'linear',
  key: 'HAR-21',
  summary: 'Berth map flickers when a booking changes',
  status: 'Todo',
  category: 'new',
  priority: 'Urgent',
  priorityLevel: 1,
  labels: [{ name: 'Bug', color: '#eb5757' }],
  cycle: {
    id: 'cycle-4',
    name: 'Cycle 4',
    startsAt: '2026-10-06T00:00:00.000Z',
    endsAt: '2026-10-20T00:00:00.000Z',
  },
  estimate: 2,
  project: 'Dashboard polish',
  team: 'Harbour',
  description: 'Patch only the **berth** that changed.',
  comments: [
    { author: 'Mira Keel', created: '2026-10-09T10:00:00Z', markdown: 'Repro: book berth 12.' },
  ],
  url: 'https://linear.app/lantern-cove/issue/HAR-21',
  mine: false,
  sessions: [],
});
const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, a, [role="radio"]')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
const words = (calls: string[][]) => calls.map((args) => args.slice(1).join(' '));

beforeEach(() => {
  localStorage.clear();
});

test('a Linear project lists issues by state type, and the panel shows its fields and assigns the person', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      listOf([
        issue('HAR-21', 'Berth map flickers when a booking changes', { priority: 'Urgent' }),
        issue('HAR-12', 'Page the harbor master once', {
          status: 'In Progress',
          category: 'indeterminate',
          assignee: 'Rowan Tide',
          assigneeId: 'user-1',
          mine: true,
        }),
        issue('HAR-9', 'Retire the old importer', { status: 'Canceled', category: 'done' }),
      ]),
    'tickets show': () => shown,
    'tickets assign': () => envelope({ key: 'HAR-21', assignee: 'Rowan Tide', receipt: null }),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const groups = [...document.querySelectorAll('[role="listbox"] [aria-expanded]')].map(
    (g) => g.textContent,
  );
  expect(groups).toEqual(['In Progress1', 'Todo1', 'Canceled1']);
  expect(byTestId('view-switcher')[0]?.textContent).toContain('Harbour cycle');

  await click(byTestId('ticket-row').find((row) => row.textContent?.includes('HAR-21')));
  const panel = byTestId('ticket-panel')[0];
  expect(words(calls)).toContain('tickets show -- linear:HAR-21');
  // The tracker icon sits by the identifier.
  expect(panel?.querySelector('svg + .font-mono')?.textContent).toBe('HAR-21');
  expect(panel?.textContent).toContain('HAR-21Open in Linear');
  expect(panel?.textContent).toContain(
    'StatusTodoAssignee?UnassignedAssign to mePriorityUrgentLabelsBugCycleCycle 4Oct 6 to Oct 19Estimate2 pointsProjectDashboard polish',
  );
  expect(panel?.textContent).toContain('Patch only the berth that changed.');
  expect(panel?.textContent).toContain('Repro: book berth 12.');
  await click(button('Assign to me'));
  expect(words(calls)).toContain('tickets assign -- linear:HAR-21');
  expect(byTestId('start-summary')[0]?.textContent).toBe(
    'Runs in a new worktree on har-21 · assign to me',
  );
});

test('Follow Linear issues picks a team, then its cycle, a project or a saved view, with a live count', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([], []),
    prompts: () => envelope([]),
    'tickets views': () => envelope([]),
    'tickets teams': () => envelope([HARBOUR, PIER]),
    'tickets team': (args) => {
      const team = String(args.at(-1)) === 'team-pier' ? PIER : HARBOUR;
      return envelope({
        team,
        cycles: {
          current: {
            id: 'c4',
            name: 'Cycle 4',
            startsAt: '2026-10-06T00:00:00.000Z',
            endsAt: '2026-10-20T00:00:00.000Z',
          },
          next: {
            id: 'c5',
            name: 'Cycle 5',
            startsAt: '2026-10-20T00:00:00.000Z',
            endsAt: '2026-11-03T00:00:00.000Z',
          },
        },
        projects: [
          { id: 'p1', name: 'Mooring alerts', lead: 'Mira Keel', progress: 0.64 },
          { id: 'p2', name: 'Dashboard polish', progress: 0.3 },
        ],
        views: [{ id: 'v1', name: 'Needs triage', shared: false }],
      });
    },
    'tickets preview': () =>
      envelope({
        describe: 'x',
        jql: 'issues(filter: {})',
        count: 16,
        more: false,
        sprints: ['Cycle 4'],
      }),
    'tickets views add': () => envelope({ name: 'Mooring alerts', describe: 'x' }),
    'tickets follow': () => envelope({ project: 'lantern-cove', following: ['Mooring alerts'] }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('Pick the Linear issues to show here');
  await click(button('Follow Linear issues'));
  const dialog = () => byTestId('follow-view-dialog')[0]?.textContent ?? '';
  expect(dialog()).toContain(
    'Follow Linear issuesThey show up in this tab and stay current as cycles change.',
  );
  // 1 Team: the first is picked; 2 What to follow: its current cycle, with dates.
  expect(byTestId('linear-teams')[0]?.textContent).toBe('HARHarbourPIERPier');
  expect(dialog()).toContain('Current cycleCycle 4, Oct 6 to Oct 19');
  expect(dialog()).toContain('Next cycleCycle 5, Oct 20 to Nov 2');
  expect(dialog()).toContain('When a cycle ends, the view moves to the next one on its own.');
  expect(dialog()).toContain('Only issues assigned to me');
  expect(dialog()).toContain('Hide completed and canceled');
  expect(words(calls)).toContain(
    'tickets preview --provider linear --team team-har --cycle current',
  );
  expect(dialog()).toContain('16 issues right now, shown as "Harbour cycle".');
  expect(dialog()).toContain('Advanced: the filter Mesa sends');

  await click(document.getElementById('linear-cycle-next') ?? undefined);
  expect(words(calls)).toContain('tickets preview --provider linear --team team-har --cycle next');
  expect(dialog()).toContain('shown as "Harbour next cycle".');

  // Project: its lead and progress; the first is picked.
  await click(button('Project'));
  expect(dialog()).toContain('Mooring alertsLead Mira Keel64%');
  expect(words(calls)).toContain('tickets preview --provider linear --linear-project p1');
  await click(button('Saved view'));
  expect(dialog()).toContain('Needs triageYour view');
  expect(words(calls)).toContain('tickets preview --provider linear --view v1');
  await click(button('Project'));
  await click(byTestId('confirm-follow-view')[0]);
  expect(
    words(calls).filter((w) => w.startsWith('tickets views add') || w.startsWith('tickets follow')),
  ).toEqual([
    'tickets views add --provider linear --linear-project p1 -- Mooring alerts',
    'tickets follow -- lantern-cove Mooring alerts',
  ]);
});

test("Follow Linear issues says why teams or a team's work did not read, and Connect or Try again reads them", async () => {
  let connected = false;
  let workFails = true;
  const linear = { id: 'linear', label: 'Linear', connected, status: 'disconnected' };
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([], []),
    prompts: () => envelope([]),
    'tickets views': () => envelope([]),
    'tickets teams': () =>
      connected
        ? envelope([HARBOUR])
        : {
            ok: false,
            error: {
              code: 'not_found',
              message: 'Linear is not connected: run mesa sources connect linear',
              details: { connect: 'linear' },
            },
          },
    'tickets team': () =>
      workFails
        ? failure('Linear is rate limiting Mesa: try again in a minute', 'internal')
        : envelope({ team: HARBOUR, cycles: {}, projects: [], views: [] }),
    'tickets preview': () => envelope({ describe: 'x', jql: null, count: 0, more: false }),
    'sources list': () => envelope({ sources: [linear] }),
    'sources connect': () => {
      connected = true;
      return envelope({ ...linear, connected: true, status: 'connected' });
    },
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(button('Follow Linear issues'));
  expect(byTestId('source-error')[0]?.textContent).toContain('Linear is not connected');
  await click(button('Connect'));
  expect(words(calls)).toContain('sources connect linear');
  expect(byTestId('linear-teams')[0]?.textContent).toBe('HARHarbour');
  expect(byTestId('source-error')[0]?.textContent).toContain('Linear is rate limiting Mesa');
  workFails = false;
  await click(button('Try again'));
  expect(byTestId('source-error')).toHaveLength(0);
  // Try again reads again inside the dialog: it does not submit it.
  expect(words(calls).filter((w) => w.startsWith('tickets views add'))).toEqual([]);
  expect(byTestId('follow-view-dialog')[0]?.textContent).toContain('No active cycle yet');
});
