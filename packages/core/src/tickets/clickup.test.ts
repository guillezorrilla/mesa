import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import {
  agentWorld,
  clickupTaskObject,
  clickupWorld,
  projectProfile,
  TEST_CLICKUP,
  testStore,
} from '../testing/index.js';

// Invented Workspace ws-1 (Lantern Cove): Space Harbor ops (s1), Folder Q4 roadmap (f1), List
// Sprint 18 (l1), and tasks with custom ids DOCK-n.

const LIST = 'https://app.clickup.com/ws-1/v/li/l1';
const MINE = '/v2/list/l1/task?subtasks=true&assignees%5B%5D=101';

/** lantern-cove with ClickUp connected over clickupWorld, its Spaces, Folders, Lists and views served. */
async function setUp() {
  const world = clickupWorld();
  const agents = agentWorld();
  const run: Runner = async (file, args, ...rest) =>
    file === '/usr/bin/open'
      ? world.deps.run(file, args, ...rest)
      : agents.run(file, args, ...rest);
  const sleeps: number[] = [];
  const { home, mesa } = projectProfile(run, {
    ...world.deps,
    run,
    clock: () => new Date('2026-09-24T12:00:00.000Z'),
    sleep: async (ms) => void sleeps.push(ms),
  });
  await mesa.sources.connect('clickup');
  world.serveLocations();
  return { world, home, mesa, sleeps };
}

/** A List view of Sprint 18, followed by lantern-cove, which tracks work in ClickUp. */
async function followSprint(mesa: Awaited<ReturnType<typeof setUp>>['mesa']) {
  const view = await mesa.tickets.addView({ provider: 'clickup', name: 'Sprint 18', list: LIST });
  mesa.tickets.setTracker('lantern-cove', 'clickup');
  mesa.tickets.follow('lantern-cove', 'Sprint 18');
  return view;
}

test('a ClickUp view follows a List: its tasks and subtasks listed by status type, one read whole, and Assign to me adds the person', async () => {
  const { world, mesa } = await setUp();
  // The Follow dialog's Location tree and saved views (task views only).
  expect(await mesa.tickets.locations()).toEqual({
    workspaces: [
      {
        id: 'ws-1',
        name: 'Lantern Cove',
        spaces: [
          {
            id: 's1',
            name: 'Harbor ops',
            color: '#7b68ee',
            folders: [
              { id: 'f1', name: 'Q4 roadmap', lists: [{ id: 'l1', name: 'Sprint 18', tasks: 14 }] },
            ],
            lists: [{ id: 'l2', name: 'Inbox', tasks: 0 }],
          },
        ],
      },
    ],
  });
  expect((await mesa.tickets.savedViews()).views).toEqual([
    { id: 'v-mine', name: 'My open tasks', type: 'list', workspace: 'ws-1', where: 'Everything' },
    {
      id: 'v-board',
      name: 'Dock sprint board',
      type: 'board',
      workspace: 'ws-1',
      where: 'Harbor ops',
    },
  ]);

  // A List by its link: adding it reads its name and where it is.
  expect(await followSprint(mesa)).toMatchObject({
    provider: 'clickup',
    workspace: 'ws-1',
    kind: 'list',
    id: 'l1',
    title: 'Sprint 18',
    path: 'Harbor ops / Q4 roadmap',
    describe: 'Harbor ops / Q4 roadmap, assigned to me',
  });
  world.serveTasks(MINE, [
    [
      clickupTaskObject('86a1', 'Replace the fender sensors on dock 3', {
        custom: 'DOCK-112',
        type: 'custom',
        assignees: ['Rowan Tide', 'Ash Pier'],
        priority: 'high',
      }),
      clickupTaskObject('86a2', 'Get two quotes for 24 mm lines', {
        custom: 'DOCK-116',
        parent: '86a3',
        assignees: ['Rowan Tide'],
      }),
      clickupTaskObject('86a4', 'Paint the berth numbers', {
        type: 'done',
        assignees: ['Rowan Tide'],
      }),
    ],
  ]);
  const listed = await mesa.tickets.list('lantern-cove');
  expect(listed).toMatchObject({ tracker: 'clickup', views: [{ name: 'Sprint 18' }] });
  expect(listed.tickets.map((t) => [t.id, t.status, t.category, t.parent, t.mine])).toEqual([
    ['clickup:DOCK-112', 'in progress', 'indeterminate', undefined, true],
    ['clickup:DOCK-116', 'to do', 'new', '86a3', true],
    // No custom id: the task's own id.
    ['clickup:86a4', 'review', 'done', undefined, true],
  ]);
  expect(listed.tickets[0]).toMatchObject({
    key: 'DOCK-112',
    color: '#5f55ee',
    priority: 'High',
    assignee: 'Rowan Tide',
    assignees: [
      { id: '101', name: 'Rowan Tide' },
      { id: '103', name: 'Ash Pier' },
    ],
    // The link names the custom id in its Workspace, so an import files it as DOCK-112.
    url: 'https://app.clickup.com/t/ws-1/DOCK-112',
  });

  // A Folder's every List, everyone's, closed too: the Workspace's tasks in the Folder.
  world.serveTasks('/v2/team/ws-1/task?project_ids%5B%5D=f1&subtasks=true&include_closed=true', [
    [clickupTaskObject('86b1', 'Order spare mooring lines', { type: 'closed' })],
  ]);
  expect(
    await mesa.tickets.preview({
      provider: 'clickup',
      folder: 'f1',
      everyone: true,
      showDone: true,
    }),
  ).toEqual({
    describe: 'Folder, closed too',
    jql: 'GET /v2/team/ws-1/task?project_ids[]=f1&subtasks=true&include_closed=true',
    count: 1,
    more: false,
  });

  world.serveTaskObject(
    clickupTaskObject('86a2', 'Get two quotes for 24 mm lines', {
      custom: 'DOCK-116',
      parent: '86a3',
      assignees: ['Mira Keel'],
      priority: 'low',
      tags: ['purchasing'],
      due: String(Date.parse('2026-10-13T00:00:00Z')),
      markdown: 'Ask the **usual** chandler and one other.',
    }),
    [{ by: 'Ash Pier', text: 'Note the lead time.' }],
  );
  world.serve(
    `${TEST_CLICKUP}/v2/task/86a3`,
    clickupTaskObject('86a3', 'Order spare mooring lines', { custom: 'DOCK-115' }),
  );
  expect(await mesa.tickets.show('clickup:DOCK-116')).toEqual({
    id: 'clickup:DOCK-116',
    provider: 'clickup',
    key: 'DOCK-116',
    summary: 'Get two quotes for 24 mm lines',
    status: 'to do',
    category: 'new',
    color: '#87909e',
    assignee: { name: 'Mira Keel', accountId: '102' },
    assignees: [{ name: 'Mira Keel', accountId: '102' }],
    priority: 'Low',
    priorityColor: '#f8ae00',
    labels: [{ name: 'purchasing', color: '#4466ff' }],
    due: '2026-10-13T00:00:00.000Z',
    path: ['Harbor ops', 'Q4 roadmap', 'Sprint 18'],
    parent: { key: 'DOCK-115', summary: 'Order spare mooring lines' },
    description: 'Ask the **usual** chandler and one other.',
    comments: [
      { author: 'Ash Pier', created: '2026-09-21T14:13:20.000Z', markdown: 'Note the lead time.' },
    ],
    url: 'https://app.clickup.com/t/ws-1/DOCK-116',
    mine: false,
    sessions: [],
  });

  // Assign to me adds the person beside the task's other assignees, with a receipt.
  const sent: unknown[] = [];
  const task = `${TEST_CLICKUP}/v2/task/DOCK-116?custom_task_ids=true&team_id=ws-1`;
  world.servePut(task, (body) => {
    sent.push(body);
    return clickupTaskObject('86a2', 'Get two quotes', { assignees: ['Mira Keel', 'Rowan Tide'] });
  });
  const assigned = await mesa.tickets.assign('clickup:DOCK-116');
  expect(sent).toEqual([{ assignees: { add: [101], rem: [] } }]);
  expect(assigned.result).toEqual({ key: 'DOCK-116', assignee: 'Rowan Tide' });
  expect(assigned.receipt).toBeDefined();

  world.servePut(task, () => clickupTaskObject('86a2', 'Get two quotes'));
  await expect(mesa.tickets.assign('clickup:DOCK-116')).rejects.toThrow(
    'ClickUp did not add you to DOCK-116',
  );
  await expect(mesa.tickets.show('clickup:DOCK 116')).rejects.toThrow(
    'DOCK 116 is not a ClickUp task id or custom id',
  );
});

test('a saved view lists its own tasks, narrowed here to the person and open ones, and pages up to a cap', async () => {
  const { world, mesa } = await setUp();
  const view = await mesa.tickets.addView({ provider: 'clickup', name: 'Board', view: 'v-board' });
  expect(view).toMatchObject({ kind: 'view', title: 'Dock sprint board', viewType: 'board' });
  expect(view.describe).toBe('Board view, assigned to me');
  const page = (from: number, more: Parameters<typeof clickupTaskObject>[2] = {}) =>
    Array.from({ length: 100 }, (_, at) =>
      clickupTaskObject(`86p${from + at}`, `Task ${from + at}`, more),
    );
  world.serveTasks('/v2/view/v-board/task', [
    [
      clickupTaskObject('86c1', 'Mine and open', { assignees: ['Rowan Tide'] }),
      clickupTaskObject('86c2', 'Mine and closed', { assignees: ['Rowan Tide'], type: 'closed' }),
      clickupTaskObject('86c3', 'Someone else', { assignees: ['Mira Keel'] }),
    ],
  ]);
  expect(
    await mesa.tickets.preview({
      provider: 'clickup',
      view: 'https://app.clickup.com/ws-1/v/b/v-board',
    }),
  ).toMatchObject({ count: 1, more: false, jql: 'GET /v2/view/v-board/task' });

  // Three full pages and more after them: 300 tasks, and more.
  world.serveTasks('/v2/view/v-board/task', [page(0), page(100), page(200), page(300)]);
  const all = { provider: 'clickup', view: 'v-board', everyone: true, showDone: true } as const;
  expect(await mesa.tickets.preview(all)).toMatchObject({ count: 300, more: true });
  // Narrowed to the person's here, after the cap: none of the 300 read are theirs, but the pages
  // not read may hold some, so "or more" stays.
  const mine = { provider: 'clickup', view: 'v-board' } as const;
  expect(await mesa.tickets.preview(mine)).toMatchObject({ count: 0, more: true });
});

test('a view names one List, Folder, Space or view, by a link of its kind or an id', async () => {
  const { mesa } = await setUp();
  await expect(mesa.tickets.addView({ provider: 'clickup', name: 'x' })).rejects.toThrow(
    'a ClickUp view follows one of --list, --folder, --space or --view',
  );
  await expect(
    mesa.tickets.addView({ provider: 'clickup', name: 'x', folder: LIST }),
  ).rejects.toThrow(`${LIST} links a list, not a folder`);
  await expect(
    mesa.tickets.addView({
      provider: 'clickup',
      name: 'x',
      space: 'https://app.clickup.com/t/86a1',
    }),
  ).rejects.toThrow('is not a ClickUp List, Folder, Space or view link');
  // A bare id is in the one Workspace connected.
  expect(
    await mesa.tickets.addView({ provider: 'clickup', name: 'ops', space: 's1' }),
  ).toMatchObject({
    workspace: 'ws-1',
    kind: 'space',
    title: 'Harbor ops',
    describe: 'Space, assigned to me',
  });
});

test('a session started from a ClickUp task imports it by its custom id, and its Live dot matches by provider and key', async () => {
  const { world, mesa, home } = await setUp();
  await followSprint(mesa);
  const task = clickupTaskObject('86a1', 'Replace the fender sensors', {
    custom: 'DOCK-112',
    assignees: ['Rowan Tide'],
    markdown: 'Swap all four.',
  });
  world.serveTasks(MINE, [[task]]);
  world.serveTaskObject(task, [{ by: 'Ash Pier', text: 'Spares are in locker B.' }]);
  const [listed] = (await mesa.tickets.list('lantern-cove')).tickets;
  // The app imports the ticket's link, then starts from its key.
  await mesa.imports.add('lantern-cove', [listed?.url ?? ''], false);
  const built = await mesa.imports.open('lantern-cove', {
    from: 'DOCK-112',
    notes: false,
    kind: 'session',
  });
  expect(built.result.goal).toMatch(/^Load DOCK-112 as context/);
  expect(built.result.goal).toMatch(/Snapshot: raw\/clickup\/DOCK-112\/\S+\.md/);
  const record = testStore(home)
    .list()
    .find((r) => r.from?.source === 'clickup');
  expect(record?.from).toEqual({ source: 'clickup', id: 'DOCK-112' });
  const [ticket] = (await mesa.tickets.list('lantern-cove')).tickets;
  expect(ticket?.sessions).toEqual([{ id: record?.id, project: 'lantern-cove' }]);
});

test('a ClickUp task is a ticket, with the ticket prompt and the Ticket starts; an imported Doc page is not', async () => {
  const { world, mesa } = await setUp();
  mesa.prompts.save('Ticket flow', 'Branch, test first, open a PR.');
  mesa.tickets.setPrompt('Ticket flow');
  world.serve(`${TEST_CLICKUP}/v3/workspaces/ws-1/docs/d1/pages/p1?content_format=text/md`, {
    name: 'Harbour rules',
    content: 'Tie up at the north wall.',
  });
  const task = clickupTaskObject('86a1', 'Replace the fender sensors', { custom: 'DOCK-112' });
  world.serveTaskObject(task);
  await mesa.imports.add(
    'lantern-cove',
    ['https://app.clickup.com/ws-1/v/dc/d1/p1', 'https://app.clickup.com/t/ws-1/DOCK-112'],
    false,
  );

  const page = await mesa.imports.goal('lantern-cove', 'd1.p1');
  expect(page.goal).not.toContain('Branch, test first');
  await expect(mesa.imports.goal('lantern-cove', 'd1.p1', undefined, 'session')).rejects.toThrow(
    '--as starts a ticket (jira, github, clickup, linear); d1.p1 is a clickup item',
  );
  await expect(
    mesa.imports.open('lantern-cove', { from: 'd1.p1', notes: false, kind: 'goal' }),
  ).rejects.toThrow('d1.p1 is a clickup item');

  const ticket = await mesa.imports.goal('lantern-cove', 'DOCK-112');
  expect(ticket.goal).toMatch(/^Branch, test first, open a PR\./);
  const started = await mesa.imports.goal('lantern-cove', 'DOCK-112', undefined, 'session');
  expect(started.goal).toMatch(/^Load DOCK-112 as context/);
  expect(started.goal).toContain('My rules:\nBranch, test first, open a PR.');
});

test("one Follow dialog's reads take each Space's Folders and Lists once, and the views by the Spaces list alone", async () => {
  const { world, mesa } = await setUp();
  const before = world.requests.length;
  await mesa.tickets.locations();
  await mesa.tickets.savedViews();
  expect(world.requests.slice(before).map((r) => r.url.replace(TEST_CLICKUP, ''))).toEqual([
    '/v2/team/ws-1/space?archived=false',
    '/v2/space/s1/folder?archived=false',
    '/v2/space/s1/list?archived=false',
    '/v2/team/ws-1/space?archived=false',
    '/v2/team/ws-1/view',
    '/v2/space/s1/view',
  ]);
});

test("a view's read goes through the source's authorized fetch: a 429 waits until X-RateLimit-Reset", async () => {
  const { world, mesa, sleeps } = await setUp();
  await followSprint(mesa);
  const answers = [
    {
      status: 429,
      headers: { 'x-ratelimit-reset': String(Date.parse('2026-09-24T12:00:05Z') / 1000) },
      body: {},
    },
    { body: { tasks: [clickupTaskObject('86a1', 'Replace the fender sensors')], last_page: true } },
  ];
  world.routes[`GET ${TEST_CLICKUP}${MINE}&page=0`] = () =>
    answers.shift() ?? { status: 500, body: {} };
  expect((await mesa.tickets.list('lantern-cove')).tickets.map((t) => t.key)).toEqual(['86a1']);
  expect(sleeps).toEqual([5000]);
});
