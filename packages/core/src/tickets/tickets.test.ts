import { expect, test } from 'vitest';
import { importProfile, newSession, TEST_JIRA, testStore } from '../testing/index.js';

const AGILE = 'https://api.atlassian.com/ex/jira/cloud-1/rest/agile/1.0';
const SITE = 'https://lantern-cove.atlassian.net';
const MINE = 'assignee = currentUser() AND statusCategory != Done';

/** Jira's search URL for `jql`, as the Tickets tab asks it. */
const search = (jql: string) =>
  `${TEST_JIRA}/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,priority&maxResults=100`;
const issue = (key: string, summary: string, status = 'In Progress', done = false) => ({
  key,
  fields: {
    summary,
    status: { name: status, statusCategory: { key: done ? 'done' : 'indeterminate' } },
    assignee: { displayName: 'Rowan Tide', accountId: 'acc-1' },
  },
});

/** lantern-cove with Atlassian connected, board 42 (Tide team) and filter 10042 on its site. */
async function setUp() {
  const profile = await importProfile();
  const { world } = profile;
  world.serve(`${AGILE}/board?startAt=0&maxResults=50`, {
    values: [{ id: 42, name: 'Tide team', type: 'scrum' }],
    isLast: true,
  });
  world.serve(`${TEST_JIRA}/filter/10042`, { id: '10042', name: 'Harbor bugs' });
  const sprint = (
    state: 'active' | 'future',
    values: { id: number; name: string; originBoardId?: number }[],
  ) => world.serve(`${AGILE}/board/42/sprint?state=${state}&maxResults=50`, { values });
  return { ...profile, sprint };
}

test("a board view reads the board's current sprint, found again when the sprint rolls over", async () => {
  const { mesa, world, sprint } = await setUp();
  sprint('active', [{ id: 7, name: 'Tide 7' }]);
  world.serve(search(`(sprint = 7) AND ${MINE} ORDER BY Rank ASC`), {
    issues: [issue('LC-1', 'Fix the tide alarm'), issue('LC-2', 'Chart the shoals')],
  });

  const view = await mesa.tickets.addView({ name: 'sprint', board: 42 });
  expect(view).toMatchObject({
    site: 'cloud-1',
    boardName: 'Tide team',
    sprint: 'current',
    describe: 'Current sprint of board Tide team (only mine, not done)',
  });
  mesa.tickets.follow('lantern-cove', 'sprint');
  const first = await mesa.tickets.list('lantern-cove');
  expect(first.views).toEqual([{ name: 'sprint', describe: view.describe, sprints: ['Tide 7'] }]);
  expect(first.tickets).toEqual([
    {
      key: 'LC-1',
      summary: 'Fix the tide alarm',
      status: 'In Progress',
      category: 'indeterminate',
      assignee: 'Rowan Tide',
      assigneeId: 'acc-1',
      mine: true,
      url: `${SITE}/browse/LC-1`,
      site: 'cloud-1',
      views: ['sprint'],
      sessions: [],
    },
    expect.objectContaining({ key: 'LC-2' }),
  ]);

  // Sprint 8 starts: the same view lists it, with nothing changed in Mesa. Another board's
  // active sprint that touches this board's filter is not this board's sprint.
  sprint('active', [
    { id: 8, name: 'Tide 8', originBoardId: 42 },
    { id: 9, name: 'Harbor 9', originBoardId: 41 },
  ]);
  world.serve(search(`(sprint = 8) AND ${MINE} ORDER BY Rank ASC`), {
    issues: [issue('LC-3', 'Moor the buoys')],
  });
  const rolled = await mesa.tickets.list('lantern-cove');
  expect(rolled.views[0]?.sprints).toEqual(['Tide 8']);
  expect(rolled.tickets.map((t) => t.key)).toEqual(['LC-3']);

  // A kanban board has no sprints: adding a view of it says what to follow instead.
  world.routes[`GET ${AGILE}/board/43/sprint?state=active&maxResults=50`] = {
    status: 400,
    body: { errorMessages: ['The board does not support sprints'] },
  };
  await expect(mesa.tickets.addView({ name: 'kanban', board: 43 })).rejects.toThrow(
    'board 43 has no sprints (a kanban board): follow its saved filter or a JQL query instead',
  );

  // No active sprint: an empty list that says why, not an error.
  sprint('active', []);
  expect((await mesa.tickets.list('lantern-cove')).views[0]).toMatchObject({
    note: 'No active sprint on board Tide team',
  });
});

test('filter and JQL views narrow as told, keep their own order, and a ticket in two views is listed once', async () => {
  const { mesa, world } = await setUp();
  world.serve(search(`(filter = 10042) AND ${MINE} ORDER BY updated DESC`), {
    issues: [issue('LC-1', 'Fix the tide alarm'), issue('LC-4', 'Patch the hull')],
  });
  world.serve(search('(project = LC) ORDER BY priority DESC'), {
    issues: [issue('LC-4', 'Patch the hull'), issue('LC-5', 'Log the catch', 'Done', true)],
  });
  await mesa.tickets.addView({ name: 'bugs', filter: '10042' });
  await mesa.tickets.addView({
    name: 'everything',
    jql: 'project = LC ORDER BY priority DESC',
    everyone: true,
    showDone: true,
  });
  mesa.tickets.follow('lantern-cove', 'bugs');
  mesa.tickets.follow('lantern-cove', 'everything');

  const { tickets, views } = await mesa.tickets.list('lantern-cove');
  expect(views.map((v) => v.describe)).toEqual([
    'Saved filter Harbor bugs (only mine, not done)',
    'JQL: project = LC ORDER BY priority DESC (everyone, done included)',
  ]);
  expect(tickets.map((t) => [t.key, t.views, t.category])).toEqual([
    ['LC-1', ['bugs'], 'indeterminate'],
    ['LC-4', ['bugs', 'everything'], 'indeterminate'],
    ['LC-5', ['everything'], 'done'],
  ]);
  // The views list which projects follow them; unfollowing the last one empties the tab.
  expect(mesa.tickets.views().map((v) => [v.name, v.following])).toEqual([
    ['bugs', ['lantern-cove']],
    ['everything', ['lantern-cove']],
  ]);
  mesa.tickets.removeView('bugs');
  expect(mesa.tickets.unfollow('lantern-cove', 'everything')).toEqual({
    project: 'lantern-cove',
    following: [],
  });
  expect(await mesa.tickets.list('lantern-cove')).toEqual({
    project: 'lantern-cove',
    prompt: null,
    projectPrompt: null,
    defaults: { notes: true, assign: true, start: 'worktree' },
    views: [],
    tickets: [],
  });
});

test('a token without the board scopes fails only the board view, and the connection stays connected', async () => {
  const { mesa, world, sprint } = await setUp();
  sprint('active', [{ id: 7, name: 'Tide 7' }]);
  await mesa.tickets.addView({ name: 'sprint', board: 42 });
  await mesa.tickets.addView({ name: 'mine', jql: 'project = LC' });
  world.serve(search(`(project = LC) AND ${MINE} ORDER BY updated DESC`), {
    issues: [issue('LC-1', 'Fix the tide alarm')],
  });
  mesa.tickets.follow('lantern-cove', 'sprint');
  mesa.tickets.follow('lantern-cove', 'mine');
  // Connected before Mesa asked for Jira Software's scopes.
  world.routes[`GET ${AGILE}/board/42/sprint?state=active&maxResults=50`] = {
    status: 401,
    body: { code: 401, message: 'Unauthorized; scope does not match' },
  };

  const { views, tickets } = await mesa.tickets.list('lantern-cove');
  expect(views[0]).toMatchObject({
    name: 'sprint',
    error: 'Atlassian needs reconnecting to allow this: run mesa sources connect atlassian',
    connect: 'atlassian',
  });
  expect(tickets.map((t) => t.key)).toEqual(['LC-1']);
  expect((await mesa.sources.list()).sources[0]).toMatchObject({ status: 'connected' });
});

test("a ticket shows the live sessions started from it in any project, and its goal gets the project's ticket prompt", async () => {
  const { mesa, world, home } = await setUp();
  await mesa.tickets.addView({ name: 'mine', jql: 'project = LC' });
  mesa.tickets.follow('lantern-cove', 'mine');
  world.serve(search(`(project = LC) AND ${MINE} ORDER BY updated DESC`), {
    issues: [issue('LC-12', 'Fix the tide alarm')],
  });
  const store = testStore(home);
  const running = store.create(() =>
    newSession({ project: 'harbor-gate', from: { source: 'jira', id: 'LC-12' } }),
  );
  store.create(() =>
    newSession({
      from: { source: 'jira', id: 'LC-12' },
      endedAt: '2026-09-24T12:30:00.000Z',
    }),
  );
  expect((await mesa.tickets.list('lantern-cove')).tickets[0]?.sessions).toEqual([
    { id: running.id, project: 'harbor-gate' },
  ]);

  expect(() => mesa.tickets.setPrompt('Ticket flow')).toThrow('no saved prompt Ticket flow');
  mesa.prompts.save('Ticket flow', 'Branch, test first, open a PR.');
  mesa.prompts.save('Harbor flow', 'Ask before touching the gate.');
  mesa.tickets.setPrompt('ticket flow');
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  await mesa.imports.add('lantern-cove', ['LC-12'], false);
  const profileGoal = (await mesa.imports.goal('lantern-cove', 'LC-12')).goal;
  // The prompt opens the goal, so one starting with /goal makes the issue part of its condition.
  expect(profileGoal).toMatch(
    /^Branch, test first, open a PR\.\n\nWork on the imported Jira issue LC-12: Fix the tide alarm\n/,
  );
  expect(profileGoal).toMatch(/Latest snapshot: raw\/jira\/LC-12\/\S+$/);

  // The project's own prompt replaces the profile's; clearing it brings the profile's back.
  mesa.tickets.setPrompt('Harbor flow', 'lantern-cove');
  expect((await mesa.tickets.list('lantern-cove')).prompt).toBe('Harbor flow');
  const opened = await mesa.imports.open('lantern-cove', { from: 'LC-12', goal: 'Start now.' });
  expect(opened.result.goal).toMatch(/^Ask before touching the gate\.\n\nWork on the imported/);
  expect(opened.result.goal).toMatch(/\n\nStart now\.$/);
  mesa.tickets.setPrompt(undefined, 'lantern-cove');
  expect(mesa.tickets.promptFor('lantern-cove')).toBe('Branch, test first, open a PR.');
});

test('a view names one query, an unknown project or view is not found, and a second view of a name is refused', async () => {
  const { mesa } = await setUp();
  await expect(
    mesa.tickets.addView({ name: 'both', board: 42, jql: 'project = LC' }),
  ).rejects.toThrow('a view names exactly one of a board, a saved filter, or JQL');
  await expect(mesa.tickets.addView({ name: 'odd', jql: 'x', sprint: 'next' })).rejects.toThrow(
    'only a board view has a sprint',
  );
  await mesa.tickets.addView({ name: 'mine', jql: 'project = LC' });
  await expect(mesa.tickets.addView({ name: 'Mine', jql: 'project = LC' })).rejects.toThrow(
    'ticket view Mine already exists',
  );
  expect(() => mesa.tickets.follow('lantern-cove', 'nope')).toThrow('no ticket view nope');
  expect(() => mesa.tickets.follow('nowhere', 'mine')).toThrow('no project named nowhere');
  await expect(mesa.tickets.list('nowhere')).rejects.toThrow('no project named nowhere');
});
