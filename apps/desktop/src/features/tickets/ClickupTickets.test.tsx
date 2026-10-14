// @vitest-environment happy-dom
import type { Ticket } from '@mesa/core';
import { act } from 'react';
import { beforeEach, expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { TicketsTab } from './TicketsTab';

const sprint = { name: 'Sprint 18', describe: 'Harbor ops / Q4 roadmap, assigned to me' };

const task = (key: string, summary: string, extra: Partial<Ticket> = {}): Ticket => ({
  id: `clickup:${key}`,
  provider: 'clickup',
  key,
  summary,
  status: 'to do',
  category: 'new',
  color: '#87909e',
  assignees: [],
  url: `https://app.clickup.com/t/ws-1/${key}`,
  mine: false,
  views: ['Sprint 18'],
  sessions: [],
  ...extra,
});
const listOf = (tickets: Ticket[]) =>
  envelope({
    project: 'lantern-cove',
    tracker: 'clickup',
    prompt: null,
    projectPrompt: null,
    defaults: { notes: false, assign: true, start: 'worktree' },
    views: [sprint],
    tickets,
  });
const shown = envelope({
  id: 'clickup:DOCK-116',
  provider: 'clickup',
  key: 'DOCK-116',
  summary: 'Get two quotes for 24 mm lines',
  status: 'to do',
  category: 'new',
  color: '#87909e',
  assignee: { name: 'Mira Keel', accountId: '102' },
  assignees: [
    { name: 'Mira Keel', accountId: '102' },
    { name: 'Ash Pier', accountId: '103' },
  ],
  priority: 'Low',
  priorityColor: '#87909e',
  labels: [{ name: 'purchasing', color: '#4466ff' }],
  due: '2026-10-13T12:00:00.000Z',
  path: ['Harbor ops', 'Q4 roadmap', 'Sprint 18'],
  parent: { key: 'DOCK-115', summary: 'Order spare mooring lines' },
  description: 'Ask the **usual** chandler and one other.',
  comments: [{ author: 'Ash Pier', created: '2026-09-23T10:00:00Z', markdown: 'Note lead time.' }],
  url: 'https://app.clickup.com/t/ws-1/DOCK-116',
  mine: false,
  sessions: [],
});
const workspaces = [
  {
    id: 'ws-1',
    name: 'Lantern Cove',
    spaces: [
      {
        id: 's1',
        name: 'Harbor ops',
        color: '#7b68ee',
        folders: [
          {
            id: 'f1',
            name: 'Q4 roadmap',
            lists: [
              { id: 'l1', name: 'Sprint 18', tasks: 14 },
              { id: 'l3', name: 'Backlog', tasks: 41 },
            ],
          },
        ],
        lists: [{ id: 'l2', name: 'Inbox', tasks: 0 }],
      },
    ],
  },
];
const button = (label: string) =>
  [...document.querySelectorAll<HTMLElement>('button, a, [role="menuitem"], [role="radio"]')].find(
    (item) => item.textContent?.trim() === label || item.getAttribute('aria-label') === label,
  );
const words = (calls: string[][]) => calls.map((args) => args.slice(1).join(' '));

beforeEach(() => {
  localStorage.clear();
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element).closest?.('a[target="_blank"]')) event.preventDefault();
    },
    true,
  );
});

test("a ClickUp project lists tasks and subtasks by status, and the panel shows ClickUp's status, assignees, priority, tags, due date, List and parent, and adds the person", async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () =>
      listOf([
        task('DOCK-112', 'Replace the fender sensors', {
          status: 'in progress',
          category: 'indeterminate',
          color: '#5f55ee',
          assignees: [
            { id: '101', name: 'Rowan Tide' },
            { id: '103', name: 'Ash Pier' },
          ],
          mine: true,
        }),
        task('DOCK-116', 'Get two quotes for 24 mm lines', {
          parent: '86a3',
          assignee: 'Mira Keel',
          assignees: [{ id: '102', name: 'Mira Keel' }],
        }),
        task('DOCK-101', 'Paint the berth numbers', { status: 'complete', category: 'done' }),
      ]),
    'tickets show': () => shown,
    'tickets assign': () => envelope({ key: 'DOCK-116', assignee: 'Rowan Tide', receipt: null }),
    prompts: () => envelope([]),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  const groups = [...document.querySelectorAll('[role="listbox"] [aria-expanded]')].map(
    (g) => g.textContent,
  );
  expect(groups).toEqual(['in progress1', 'to do1', 'complete1']);
  // Each row's status icon wears ClickUp's own status color.
  const icon = byTestId('ticket-row')[0]?.querySelector('svg');
  expect(icon?.style.color).toBe('#5f55ee');
  const subtask = byTestId('ticket-row').find((row) => row.textContent?.includes('DOCK-116'));
  expect(subtask?.querySelector('[aria-label="Subtask"]')).not.toBeNull();

  await click(subtask);
  const panel = byTestId('ticket-panel')[0];
  expect(words(calls)).toContain('tickets show -- clickup:DOCK-116');
  // The tracker icon sits by the id; the parent line above the title.
  expect(panel?.querySelector('svg + .font-mono')?.textContent).toBe('DOCK-116');
  expect(panel?.textContent).toContain('DOCK-116Open in ClickUp');
  expect(panel?.textContent).toContain(
    'Subtask of DOCK-115Order spare mooring linesGet two quotes for 24 mm lines',
  );
  expect(panel?.textContent).toContain(
    'Statusto doAssigneesMKMira KeelAPAsh PierAssign to mePriorityLowTagspurchasingDue dateOct 13ListHarbor ops/Q4 roadmap/Sprint 18',
  );
  const pill = [...(panel?.querySelectorAll('dd span') ?? [])].find(
    (s) => s.textContent === 'to do',
  );
  expect(pill?.className).toContain('uppercase');
  expect((pill as HTMLElement | undefined)?.style.backgroundColor).toBeTruthy();
  expect(panel?.textContent).toContain('Ask the usual chandler and one other.');
  expect(panel?.textContent).toContain('Note lead time.');
  await click(button('Assign to me'));
  expect(words(calls)).toContain('tickets assign -- clickup:DOCK-116');
  // Starting adds the person beside the assignees, on a branch named after the task.
  expect(byTestId('start-summary')[0]?.textContent).toBe('Runs in a new worktree on dock-116');
});

test('Follow ClickUp tasks picks a List from the tree, follows a whole Folder or a saved view, with a live count', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([]),
    prompts: () => envelope([]),
    'tickets views': () =>
      envelope([
        {
          ...sprint,
          provider: 'clickup',
          workspace: 'ws-1',
          kind: 'list',
          id: 'l1',
          following: ['lantern-cove'],
        },
      ]),
    'tickets locations': () => envelope({ workspaces }),
    'tickets saved-views': () =>
      envelope({
        views: [
          {
            id: 'v-mine',
            name: 'My open tasks',
            type: 'list',
            workspace: 'ws-1',
            where: 'Everything',
          },
          {
            id: 'v-board',
            name: 'Dock sprint board',
            type: 'board',
            workspace: 'ws-1',
            where: 'Harbor ops',
          },
        ],
      }),
    'tickets preview': () =>
      envelope({ describe: 'x', jql: 'GET /v2/list/l1/task?subtasks=true', count: 6, more: false }),
    'tickets views add': () => envelope({ name: 'Q4 roadmap', describe: 'x' }),
    'tickets follow': () => envelope({ project: 'lantern-cove', following: ['Q4 roadmap'] }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  expect(byTestId('tickets-tab')[0]?.textContent).toContain('No tasks in this view.');
  await click(byTestId('view-switcher')[0]);
  await click(button('Follow a view'));
  const dialog = () => byTestId('follow-view-dialog')[0]?.textContent ?? '';
  expect(dialog()).toContain('Follow ClickUp tasksThey show up in this tab, subtasks included.');
  expect(dialog()).toContain('Only tasks assigned to me');
  expect(dialog()).toContain('Hide closed tasks');
  // The first List is picked, its Space and Folder open.
  const selected = () =>
    document.querySelector('[role="treeitem"][aria-selected="true"]')?.textContent;
  expect(selected()).toBe('Sprint 1814');
  expect(words(calls)).toContain(
    'tickets preview --provider clickup --workspace ws-1 --list l1 --everyone',
  );
  expect(dialog()).toContain('6 tasks right now, subtasks included, shown as "Sprint 18 2".');

  // A Folder follows every List inside it; the search narrows the tree.
  const node = (name: string) =>
    byTestId('clickup-node').find((n) => n.textContent?.startsWith(name));
  expect(node('Q4 roadmap')?.textContent).toBe('Q4 roadmapfolder2 Lists');
  await click(node('Q4 roadmap'));
  expect(words(calls)).toContain(
    'tickets preview --provider clickup --workspace ws-1 --folder f1 --everyone',
  );
  const search = document.querySelector<HTMLInputElement>(
    'input[aria-label="Search Spaces, Folders and Lists"]',
  );
  await act(async () => {
    if (!search) return;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    set?.call(search, 'back');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(byTestId('clickup-node').map((n) => n.textContent)).toEqual([
    'HHarbor opsspace3 Lists',
    'Q4 roadmapfolder2 Lists',
    'Backlog41',
  ]);
  await click(byTestId('confirm-follow-view')[0]);
  expect(
    words(calls).filter((w) => w.startsWith('tickets views add') || w.startsWith('tickets follow')),
  ).toEqual([
    'tickets views add --provider clickup --workspace ws-1 --folder f1 --everyone -- Q4 roadmap',
    'tickets follow -- lantern-cove Q4 roadmap',
  ]);
});

test('the Saved view tab lists the views with their type and where they are kept', async () => {
  const { bridge, calls } = fakeBridge({
    tickets: () => listOf([]),
    prompts: () => envelope([]),
    'tickets views': () => envelope([]),
    'tickets locations': () => envelope({ workspaces }),
    'tickets saved-views': () =>
      envelope({
        views: [
          {
            id: 'v-mine',
            name: 'My open tasks',
            type: 'list',
            workspace: 'ws-1',
            where: 'Everything',
          },
          {
            id: 'v-board',
            name: 'Dock sprint board',
            type: 'board',
            workspace: 'ws-1',
            where: 'Harbor ops',
          },
          {
            id: 'v-map',
            name: 'Berth plan',
            type: 'mind_map_view',
            workspace: 'ws-1',
            where: 'Harbor ops',
          },
        ],
      }),
    'tickets preview': () => envelope({ describe: 'x', jql: null, count: 3, more: false }),
  });
  const byTestId = await renderWithMesa(
    <TicketsTab project="lantern-cove" onSession={() => {}} />,
    bridge,
  );
  await click(byTestId('view-switcher')[0]);
  await click(button('Follow a view'));
  await click(button('Saved view'));
  const views = document.querySelector('[role="radiogroup"][aria-label="Saved views"]');
  expect(views?.textContent).toBe(
    'listMy open tasksin EverythingboardDock sprint boardin Harbor opsmind map viewBerth planin Harbor ops',
  );
  expect(words(calls)).toContain(
    'tickets preview --provider clickup --workspace ws-1 --view v-mine --everyone',
  );
  await click(document.querySelector<HTMLElement>('#clickup-view-v-board') ?? undefined);
  expect(words(calls)).toContain(
    'tickets preview --provider clickup --workspace ws-1 --view v-board --everyone',
  );
  expect(byTestId('follow-view-dialog')[0]?.textContent).toContain(
    '3 tasks right now, subtasks included, shown as "Dock sprint board".',
  );
});
