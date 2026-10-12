import { expect, test } from 'vitest';
import {
  agentWorld,
  linearIssueObject,
  linearWorld,
  projectProfile,
  testStore,
} from '../testing/index.js';

// Invented workspace Lantern Cove (lantern-cove): team Harbour (HAR) with cycles 4 and 5, its
// project Spring tides, and a custom view; Rowan Tide (user-1) is signed in.
const HARBOUR = { id: 'team-har', key: 'HAR', name: 'Harbour', color: '#5e6ad2' };
const CYCLE_4 = {
  id: 'cycle-4',
  number: 4,
  name: null,
  startsAt: '2026-09-21T00:00:00.000Z',
  endsAt: '2026-10-04T00:00:00.000Z',
};
const CYCLE_5 = { ...CYCLE_4, id: 'cycle-5', number: 5, name: 'Spring push' };
const page = (nodes: unknown[], next?: string) => ({
  nodes,
  pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null },
});
const NOT_DONE = { state: { type: { nin: ['completed', 'canceled'] } } };
const MINE = { assignee: { isMe: { eq: true } } };

/** lantern-cove with Linear connected over linearWorld, and team Harbour's work answered. */
async function setUp() {
  const world = linearWorld();
  const agents = agentWorld();
  const run = (async (file, args, ...rest) =>
    file === '/usr/bin/open'
      ? world.deps.run(file, args, ...rest)
      : agents.run(file, args, ...rest)) as typeof world.deps.run;
  const { mesa, home } = projectProfile(run, {
    ...world.deps,
    run,
    clock: () => new Date('2026-09-24T12:00:00.000Z'),
  });
  await mesa.sources.connect('linear');
  world.answer('TicketTeams', () => ({ teams: { nodes: [HARBOUR] } }));
  world.answer('TicketTeam', ({ filter }) => ({
    teams: { nodes: /"(har|team-har)"/i.test(JSON.stringify(filter)) ? [HARBOUR] : [] },
  }));
  world.answer('TicketCycles', () => ({
    team: { activeCycle: CYCLE_4, cycles: { nodes: [CYCLE_5] } },
  }));
  world.answer('TicketProject', ({ id }) =>
    ['5e1f2a3b4c6d', 'project-1'].includes(String(id))
      ? { project: { id: 'project-1', name: 'Spring tides' } }
      : undefined,
  );
  world.answer('TicketCustomView', ({ id }) =>
    ['0a1b2c3d4e5f', 'view-1'].includes(String(id))
      ? {
          customView: {
            id: 'view-1',
            name: 'Needs triage',
            shared: false,
            modelName: 'Issue',
            team: null,
          },
        }
      : undefined,
  );
  return { world, mesa, home };
}

test('a Linear view follows a team cycle: its issues listed by state type, one read whole, and Assign to me sets the assignee', async () => {
  const { world, mesa } = await setUp();
  // What the Follow dialog picks from: teams, then a team's cycles, open projects and saved views.
  world.answer('TicketTeamWork', () => ({
    team: {
      activeCycle: CYCLE_4,
      cycles: { nodes: [CYCLE_5] },
      projects: {
        nodes: [
          { id: 'project-1', name: 'Spring tides', progress: 0.64, lead: { name: 'Mira Keel' } },
        ],
      },
    },
  }));
  world.answer('TicketCustomViews', () => ({
    customViews: {
      nodes: [
        { id: 'view-1', name: 'Needs triage', shared: false, modelName: 'Issue', team: null },
        {
          id: 'view-2',
          name: 'Pier on-call',
          shared: true,
          modelName: 'Issue',
          team: { ...HARBOUR, id: 'team-pier', key: 'PIER', name: 'Pier' },
        },
      ],
    },
  }));
  expect(await mesa.tickets.teams()).toEqual([HARBOUR]);
  expect(await mesa.tickets.team('har')).toEqual({
    team: HARBOUR,
    cycles: {
      current: {
        id: 'cycle-4',
        name: 'Cycle 4',
        startsAt: CYCLE_4.startsAt,
        endsAt: CYCLE_4.endsAt,
      },
      next: {
        id: 'cycle-5',
        name: 'Spring push',
        startsAt: CYCLE_4.startsAt,
        endsAt: CYCLE_4.endsAt,
      },
    },
    projects: [{ id: 'project-1', name: 'Spring tides', lead: 'Mira Keel', progress: 0.64 }],
    // Another team's view is left out.
    views: [{ id: 'view-1', name: 'Needs triage', shared: false }],
  });

  const view = await mesa.tickets.addView({
    provider: 'linear',
    name: 'Harbour cycle',
    team: 'HAR',
  });
  expect(view).toMatchObject({
    provider: 'linear',
    team: 'team-har',
    teamKey: 'HAR',
    teamName: 'Harbour',
    cycle: 'current',
    describe: 'Harbour, current cycle, assigned to me',
  });
  mesa.tickets.setTracker('lantern-cove', 'linear');
  mesa.tickets.follow('lantern-cove', 'Harbour cycle');
  world.answer('TicketIssues', () => ({
    issues: page([
      linearIssueObject('HAR-12', 'Page the harbor master once', { state: 'started' }),
      linearIssueObject('HAR-14', 'Cache tide predictions', { state: 'backlog', priority: 0 }),
      linearIssueObject('HAR-9', 'Retire the old importer', {
        state: 'canceled',
        assignee: 'Mira Keel',
      }),
    ]),
  }));
  const listed = await mesa.tickets.list('lantern-cove');
  expect(listed).toMatchObject({
    tracker: 'linear',
    views: [{ name: 'Harbour cycle', sprints: ['Cycle 4'] }],
  });
  expect(world.queries.at(-1)).toEqual({
    operation: 'TicketIssues',
    variables: {
      filter: { ...MINE, ...NOT_DONE, cycle: { id: { eq: 'cycle-4' } } },
      first: 50,
      after: null,
    },
  });
  expect(listed.tickets.map((t) => [t.id, t.status, t.category, t.priority, t.mine])).toEqual([
    ['linear:HAR-12', 'In Progress', 'indeterminate', 'High', true],
    ['linear:HAR-14', 'Backlog', 'new', undefined, true],
    ['linear:HAR-9', 'Canceled', 'done', 'High', false],
  ]);
  expect(listed.tickets[0]).toMatchObject({
    key: 'HAR-12',
    assignee: 'Rowan Tide',
    assigneeId: 'user-1',
    url: 'https://linear.app/lantern-cove/issue/HAR-12/page-the-harbor-master-once',
    views: ['Harbour cycle'],
    sessions: [],
  });

  // The live count of the next cycle, everyone's, completed too, and the filter Mesa sends.
  expect(
    await mesa.tickets.preview({
      provider: 'linear',
      team: 'team-har',
      cycle: 'next',
      everyone: true,
      showDone: true,
    }),
  ).toEqual({
    describe: 'Harbour, next cycle, completed too',
    jql: 'issues(filter: {"cycle":{"id":{"eq":"cycle-5"}}})',
    count: 3,
    more: false,
    sprints: ['Spring push'],
  });

  world.serveIssue('HAR-12', {
    title: 'Page the harbor master once',
    description: 'Page **once**, then again after 30 minutes.',
    assignee: 'Mira Keel',
    priority: 1,
    comments: [{ by: 'Mira Keel', text: 'Dock 3 paged 58 times.' }],
  });
  expect(await mesa.tickets.show('linear:har-12')).toEqual({
    id: 'linear:HAR-12',
    provider: 'linear',
    key: 'HAR-12',
    summary: 'Page the harbor master once',
    status: 'In Progress',
    category: 'indeterminate',
    assignee: { name: 'Mira Keel', accountId: 'user-2' },
    priority: 'Urgent',
    priorityLevel: 1,
    labels: [{ name: 'tides', color: '#4ea7fc' }],
    cycle: { id: 'cycle-4', name: 'Cycle 4', startsAt: CYCLE_4.startsAt, endsAt: CYCLE_4.endsAt },
    estimate: 3,
    project: 'Spring tides',
    team: 'Harbour',
    description: 'Page **once**, then again after 30 minutes.',
    comments: [
      {
        author: 'Mira Keel',
        created: '2026-09-21T10:00:00.000Z',
        markdown: 'Dock 3 paged 58 times.',
      },
    ],
    url: 'https://linear.app/lantern-cove/issue/HAR-12/page-the-harbor-master-once',
    mine: false,
    sessions: [],
  });

  // Assign to me: issueUpdate with the person's id, and a receipt.
  world.answer('TicketAssign', ({ id, assignee }) => ({
    issueUpdate: {
      success: true,
      issue: { assignee: { id: assignee, name: id === 'HAR-12' ? 'Rowan Tide' : '?' } },
    },
  }));
  const assigned = await mesa.tickets.assign('linear:HAR-12');
  expect(world.queries.at(-1)).toEqual({
    operation: 'TicketAssign',
    variables: { id: 'HAR-12', assignee: 'user-1' },
  });
  expect(assigned.result).toEqual({ key: 'HAR-12', assignee: 'Rowan Tide' });
  expect(assigned.receipt).toBeDefined();
  await expect(mesa.tickets.show('linear:HAR')).rejects.toThrow(
    'HAR is not a Linear issue identifier, such as ENG-123',
  );
});

test('a Linear connection without the write scope asks to reconnect to assign, and keeps listing', async () => {
  const { world, mesa } = await setUp();
  // As Linear answers a token signed in with read alone.
  world.servePost('https://api.linear.app/graphql', (body) =>
    /TicketAssign/.test(String(body.query))
      ? {
          data: null,
          errors: [
            {
              message: 'Invalid scope: `write` required',
              extensions: { type: 'forbidden', code: 'FORBIDDEN', statusCode: 403 },
            },
          ],
        }
      : { data: { viewer: { id: 'user-1', name: 'Rowan Tide' } } },
  );
  await expect(mesa.tickets.assign('linear:HAR-12')).rejects.toMatchObject({
    message: 'Linear needs reconnecting to allow this: run mesa sources connect linear',
    details: { connect: 'linear' },
  });
  expect((await mesa.sources.list()).sources.find((s) => s.id === 'linear')).toMatchObject({
    status: 'connected',
  });
  // A FORBIDDEN error that names a scope is the same answer, however Linear words it.
  world.servePost('https://api.linear.app/graphql', () => ({
    data: null,
    errors: [
      { message: 'Insufficient scopes for this operation', extensions: { code: 'FORBIDDEN' } },
    ],
  }));
  await expect(mesa.tickets.assign('linear:HAR-12')).rejects.toThrow(
    'Linear needs reconnecting to allow this',
  );
});

test('a rate limit Linear answers without its HTTP 400 says to try again', async () => {
  const { world, mesa } = await setUp();
  world.servePost('https://api.linear.app/graphql', () => ({
    data: null,
    errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }],
  }));
  await expect(mesa.tickets.teams()).rejects.toThrow(
    'Linear is rate limiting Mesa: try again in a minute',
  );
});

test('a project and a saved view follow by link; a team with no next cycle says so', async () => {
  const { world, mesa } = await setUp();
  const project = await mesa.tickets.addView({
    provider: 'linear',
    name: 'Spring tides',
    project: 'https://linear.app/lantern-cove/project/spring-tides-5e1f2a3b4c6d/overview',
    everyone: true,
  });
  expect(project).toMatchObject({
    project: 'project-1',
    projectName: 'Spring tides',
    describe: 'Project Spring tides',
  });
  const saved = await mesa.tickets.addView({
    provider: 'linear',
    name: 'Triage',
    view: 'https://linear.app/lantern-cove/view/needs-triage-0a1b2c3d4e5f',
    showDone: true,
  });
  expect(saved).toMatchObject({
    customView: 'view-1',
    customViewName: 'Needs triage',
    describe: 'Saved view Needs triage, assigned to me, completed too',
  });

  world.answer('TicketIssues', ({ after }) =>
    after
      ? { issues: page([linearIssueObject('HAR-3', 'Third')]) }
      : { issues: page([linearIssueObject('HAR-1', 'First')], 'c1') },
  );
  expect(
    await mesa.tickets.preview({ provider: 'linear', project: 'project-1', everyone: true }),
  ).toMatchObject({
    count: 2,
    jql: `issues(filter: ${JSON.stringify({ project: { id: { eq: 'project-1' } }, ...NOT_DONE })})`,
  });
  world.answer('TicketViewIssues', ({ view }) => ({
    customView: { issues: page(view === 'view-1' ? [linearIssueObject('HAR-7', 'Seventh')] : []) },
  }));
  expect(
    await mesa.tickets.preview({ provider: 'linear', view: 'view-1', showDone: true }),
  ).toMatchObject({
    count: 1,
    jql: `customView(id: "view-1") issues(filter: ${JSON.stringify(MINE)})`,
  });

  world.answer('TicketCycles', () => ({ team: { activeCycle: CYCLE_4, cycles: { nodes: [] } } }));
  expect(
    await mesa.tickets.preview({ provider: 'linear', team: 'HAR', cycle: 'next' }),
  ).toMatchObject({ count: 0, note: 'No next cycle in team Harbour' });

  await expect(
    mesa.tickets.addView({ provider: 'linear', name: 'x', team: 'HAR', project: 'project-1' }),
  ).rejects.toThrow('a Linear view names exactly one of a team, a project, or a custom view');
  await expect(
    mesa.tickets.addView({ provider: 'linear', name: 'x', team: 'NOPE' }),
  ).rejects.toThrow('no Linear team NOPE; see mesa tickets teams');
  await expect(
    mesa.tickets.addView({ provider: 'linear', name: 'x', view: 'view-9' }),
  ).rejects.toThrow(/^no Linear custom view view-9$/);
  await expect(
    mesa.tickets.addView({
      provider: 'linear',
      name: 'x',
      view: 'https://linear.app/lantern-cove/project/x-1',
    }),
  ).rejects.toThrow('is not a Linear view link');
});

test('a view lists 100 issues at most, a page of 50 at a time, and says there are more', async () => {
  const { world, mesa } = await setUp();
  const issues = Array.from({ length: 120 }, (_, n) =>
    linearIssueObject(`HAR-${n + 1}`, `Tide ${n + 1}`),
  );
  world.answer('TicketIssues', ({ after, first }) => {
    const from = after ? Number(String(after).slice(1)) : 0;
    const to = from + Number(first);
    return { issues: page(issues.slice(from, to), to < issues.length ? `c${to}` : undefined) };
  });
  expect(
    await mesa.tickets.preview({ provider: 'linear', project: 'project-1', everyone: true }),
  ).toMatchObject({ count: 100, more: true });
  expect(world.queries.filter((q) => q.operation === 'TicketIssues')).toHaveLength(2);
});

test('a session started from a Linear issue imports it through the pipeline, and its Live dot matches by provider and key', async () => {
  const { world, mesa, home } = await setUp();
  await mesa.tickets.addView({
    provider: 'linear',
    name: 'Harbour cycle',
    team: 'HAR',
    everyone: true,
  });
  mesa.tickets.setTracker('lantern-cove', 'linear');
  mesa.tickets.follow('lantern-cove', 'Harbour cycle');
  world.answer('TicketIssues', () => ({
    issues: page([linearIssueObject('HAR-12', 'Page the harbor master once')]),
  }));
  world.serveIssue('HAR-12', { title: 'Page the harbor master once', description: 'Page once.' });

  // As the app starts it: the import by the issue's link, then the session from its key.
  await mesa.imports.add(
    'lantern-cove',
    ['https://linear.app/lantern-cove/issue/HAR-12/page-the-harbor-master-once'],
    false,
  );
  const built = await mesa.imports.open('lantern-cove', {
    from: 'HAR-12',
    notes: false,
    kind: 'session',
  });
  expect(built.result.goal).toMatch(/^Load HAR-12 as context/);
  expect(built.result.goal).toMatch(/Snapshot: raw\/linear\/HAR-12\/\S+\.md/);
  const record = testStore(home)
    .list()
    .find((r) => r.from?.source === 'linear');
  expect(record?.from).toEqual({ source: 'linear', id: 'HAR-12' });
  const [ticket] = (await mesa.tickets.list('lantern-cove')).tickets;
  expect(ticket?.sessions).toEqual([{ id: record?.id, project: 'lantern-cove' }]);
  expect((await mesa.tickets.show('linear:HAR-12')).sessions).toEqual([
    { id: record?.id, project: 'lantern-cove' },
  ]);
});

test('a Linear project or document in Context is no ticket: it starts no Ticket start', async () => {
  const { world, mesa } = await setUp();
  world.answer('Project', () => ({
    project: {
      name: 'Spring tides',
      description: null,
      content: 'Tides.',
      updatedAt: '2026-09-24T12:00:00.000Z',
      status: null,
      lead: null,
      startDate: null,
      targetDate: null,
      teams: { nodes: [] },
    },
  }));
  await mesa.imports.add(
    'lantern-cove',
    ['https://linear.app/lantern-cove/project/spring-tides-5e1f2a3b4c6d'],
    false,
  );
  await expect(
    mesa.imports.open('lantern-cove', { from: 'project.5e1f2a3b4c6d', notes: false, kind: 'goal' }),
  ).rejects.toThrow('--as starts a ticket');
  world.answer('Document', () => ({
    document: {
      title: 'Harbour rules',
      content: 'Moor bow first.',
      updatedAt: '2026-09-24T12:00:00.000Z',
    },
  }));
  await mesa.imports.add(
    'lantern-cove',
    ['https://linear.app/lantern-cove/document/harbour-rules-9a8b7c6d5e4f'],
    false,
  );
  await expect(
    mesa.imports.open('lantern-cove', {
      from: 'document.9a8b7c6d5e4f',
      notes: false,
      kind: 'session',
    }),
  ).rejects.toThrow('--as starts a ticket');
});
