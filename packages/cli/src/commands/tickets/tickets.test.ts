import {
  clickupTaskObject,
  clickupWorld,
  githubIssueObject,
  githubWorld,
  scriptedRunner,
  TEST_CLICKUP,
  TEST_GITHUB,
  TEST_JIRA,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const AGILE = 'https://api.atlassian.com/ex/jira/cloud-1/rest/agile/1.0';
const search = (jql: string) =>
  `${TEST_JIRA}/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,priority&maxResults=100`;

/** Atlassian connected, with board 42, filter 10042, and the active sprint 7 on lantern-cove. */
async function connected() {
  const { world } = await cli.withImports();
  world.serve(`${AGILE}/board?maxResults=50&name=tide`, {
    values: [{ id: 42, name: 'Tide team', type: 'scrum', location: { projectKey: 'LC' } }],
  });
  world.serve(`${AGILE}/board?startAt=0&maxResults=50`, {
    values: [{ id: 42, name: 'Tide team', type: 'scrum' }],
    isLast: true,
  });
  world.serve(`${AGILE}/board/42/sprint?state=active&maxResults=50`, {
    values: [{ id: 7, name: 'Tide 7' }],
  });
  world.serve(`${TEST_JIRA}/filter/search?maxResults=50&filterName=bugs`, {
    values: [{ id: '10042', name: 'Harbor bugs' }],
  });
  world.serve(
    search(
      '(sprint = 7) AND assignee = currentUser() AND statusCategory != Done ORDER BY Rank ASC',
    ),
    {
      issues: [
        {
          key: 'LC-1',
          fields: {
            summary: 'Fix the tide alarm',
            status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
            assignee: { displayName: 'Rowan Tide' },
          },
        },
      ],
    },
  );
  return world;
}

test('mesa tickets boards and filters list what a view can name', async () => {
  await connected();
  const boards = await cli.mesa('tickets', 'boards', '--search', 'tide', '--json');
  expect(boards.json.data).toEqual({
    site: { id: 'cloud-1', name: 'lantern-cove' },
    boards: [{ id: 42, name: 'Tide team', type: 'scrum', project: 'LC' }],
  });
  expect((await cli.mesa('tickets', 'boards', '--search', 'tide')).stdout).toContain(
    '42  Tide team (scrum, LC)',
  );
  const filters = await cli.mesa('tickets', 'filters', '--search', 'bugs', '--json');
  expect(filters.json.data.filters).toEqual([{ id: '10042', name: 'Harbor bugs' }]);
});

test("mesa tickets views add, follow and the list read a board's current sprint", async () => {
  await connected();
  const added = await cli.mesa('tickets', 'views', 'add', 'sprint', '--board', '42', '--json');
  expect(added.json.data).toMatchObject({
    name: 'sprint',
    board: 42,
    boardName: 'Tide team',
    sprint: 'current',
  });
  expect((await cli.mesa('tickets', 'views', 'add', 'x', '--board', 'tide')).code).toBe(2);
  expect((await cli.mesa('tickets', 'follow', 'lantern-cove', 'sprint')).stdout).toContain(
    'lantern-cove follows sprint',
  );
  const views = await cli.mesa('tickets', 'views', '--json');
  expect(views.json.data).toMatchObject([{ name: 'sprint', following: ['lantern-cove'] }]);

  const list = await cli.mesa('tickets', 'lantern-cove');
  expect(list.stdout).toContain(
    'sprint: Current sprint of board Tide team (only mine, not done) [Tide 7]',
  );
  expect(list.stdout).toContain('LC-1  In Progress  Fix the tide alarm');
  const json = await cli.mesa('tickets', 'lantern-cove', '--json');
  expect(json.json.data.tickets).toMatchObject([{ key: 'LC-1', views: ['sprint'], sessions: [] }]);

  expect((await cli.mesa('tickets', 'views', 'rename', 'sprint', 'Tide sprint')).stdout).toContain(
    'Renamed sprint to Tide sprint',
  );
  expect((await cli.mesa('tickets', 'unfollow', 'lantern-cove', 'Tide sprint')).stdout).toContain(
    'lantern-cove follows no ticket views',
  );
  expect((await cli.mesa('tickets', 'views', 'remove', 'Tide sprint')).stdout).toContain(
    'Removed Tide sprint',
  );
  expect((await cli.mesa('tickets', 'views')).stdout).toBe('No ticket views.\n');
});

test('mesa tickets tracker shows or sets where a project tracks work', async () => {
  await connected();
  expect((await cli.mesa('tickets', 'tracker', 'lantern-cove')).stdout).toContain(
    'lantern-cove has no tracker yet',
  );
  const set = await cli.mesa('tickets', 'tracker', 'lantern-cove', 'jira', '--json');
  expect(set.json.data).toEqual({ project: 'lantern-cove', tracker: 'jira' });
  expect((await cli.mesa('tickets', 'tracker', 'lantern-cove')).stdout).toContain(
    'lantern-cove tracks work in jira',
  );
  expect((await cli.mesa('tickets', 'tracker', 'lantern-cove', 'trello')).code).toBe(2);
});

test('mesa tickets prompt names a Saved prompt for the profile or a project, or clears it', async () => {
  await cli.withProject();
  expect((await cli.mesa('tickets', 'prompt')).code).toBe(2);
  expect((await cli.mesa('tickets', 'prompt', 'Ticket flow', '--json')).json.error.code).toBe(
    'not_found',
  );
  await cli.mesa('prompts', 'save', 'Ticket flow', 'Branch, test first, open a PR.');
  expect((await cli.mesa('tickets', 'prompt', 'Ticket flow')).stdout).toContain(
    'Ticket prompt for the profile: Ticket flow',
  );
  const project = await cli.mesa(
    'tickets',
    'prompt',
    'ticket flow',
    '--project',
    'lantern-cove',
    '--json',
  );
  expect(project.json.data).toEqual({ project: 'lantern-cove', prompt: 'Ticket flow' });
  expect((await cli.mesa('tickets', 'prompt', '--clear')).stdout).toContain(
    "Cleared the profile's ticket prompt",
  );
});

test('mesa tickets show, assign, preview and defaults, and import goal --prompt', async () => {
  const world = await connected();
  world.serve(`${TEST_JIRA}/issue/LC-12?expand=renderedFields`, {
    fields: {
      summary: 'Fix the tide alarm',
      status: { name: 'To Do', statusCategory: { key: 'new' } },
      labels: [],
    },
    renderedFields: { description: '<p>Late.</p>' },
  });
  world.serve(`${TEST_JIRA}/issue/LC-12/comment?expand=renderedBody&startAt=0&maxResults=100`, {
    total: 0,
    comments: [],
  });
  const shown = await cli.mesa('tickets', 'show', 'LC-12');
  expect(shown.stdout).toContain('LC-12: Fix the tide alarm\nTo Do · Unassigned');
  expect(shown.stdout).toContain('\nLate.\n');

  // A ticket id names its provider; a bare Jira key still works.
  expect((await cli.mesa('tickets', 'show', 'jira:LC-12', '--json')).json.data).toMatchObject({
    id: 'jira:LC-12',
    provider: 'jira',
  });

  world.servePut(`${TEST_JIRA}/issue/LC-12/assignee`, () => ({}));
  expect((await cli.mesa('tickets', 'assign', 'LC-12')).stdout).toContain(
    'Assigned LC-12 to Rowan Tide',
  );
  expect((await cli.mesa('tickets', 'assign', 'jira:LC-12')).stdout).toContain(
    'Assigned LC-12 to Rowan Tide',
  );

  const preview = await cli.mesa('tickets', 'preview', '--board', '42', '--json');
  expect(preview.json.data).toMatchObject({ count: 1, more: false, sprints: ['Tide 7'] });
  expect((await cli.mesa('tickets', 'preview', '--board', 'x')).code).toBe(2);

  expect((await cli.mesa('tickets', 'defaults', 'lantern-cove')).stdout).toContain(
    'notes off, assign on, start in a new worktree',
  );
  const changed = await cli.mesa(
    'tickets',
    'defaults',
    'lantern-cove',
    '--start',
    'checkout',
    '--notes',
    'on',
    '--json',
  );
  expect(changed.json.data).toEqual({
    notes: true,
    assign: true,
    start: 'checkout',
  });
  expect((await cli.mesa('tickets', 'defaults', 'lantern-cove', '--notes', 'maybe')).code).toBe(2);

  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  await cli.mesa('import', 'LC-12', '--project', 'lantern-cove', '--no-notes');
  await cli.mesa('prompts', 'save', 'Hotfix flow', 'Smallest safe change.');
  const goal = await cli.mesa(
    'import',
    'goal',
    'LC-12',
    '--project',
    'lantern-cove',
    '--prompt',
    'Hotfix flow',
  );
  expect(goal.stdout).toMatch(/^Smallest safe change\.\n\nWork on the imported/);
  const none = await cli.mesa(
    'import',
    'goal',
    'LC-12',
    '--project',
    'lantern-cove',
    '--no-prompt',
  );
  expect(none.stdout).toMatch(/^Work on the imported/);
  const done = await cli.mesa(
    'import',
    'goal',
    'LC-12',
    '--project',
    'lantern-cove',
    '--no-prompt',
    '--as',
    'goal',
  );
  expect(done.stdout).toMatch(/^\/goal Finish LC-12: do what the ticket asks\./);
  const wrong = await cli.mesa('import', 'goal', 'LC-12', '--project', 'lantern-cove', '--as', 'x');
  expect(wrong.code).toBe(2);
  expect(
    (
      await cli.mesa(
        'import',
        'goal',
        'LC-12',
        '--project',
        'lantern-cove',
        '--prompt',
        'x',
        '--no-prompt',
      )
    ).code,
  ).toBe(2);
});

test('mesa tickets fields lists the Jira fields, marks the shown ones, and fields set picks them', async () => {
  const world = await connected();
  world.serve(`${TEST_JIRA}/field`, [
    { id: 'customfield_10067', name: 'Severity (SLA)' },
    { id: 'components', name: 'Components' },
  ]);
  expect((await cli.mesa('tickets', 'fields', 'set')).code).toBe(2);
  expect((await cli.mesa('tickets', 'fields', 'set', 'components')).stdout).toContain(
    'Ticket panels show Components',
  );
  expect((await cli.mesa('tickets', 'fields')).stdout).toBe(
    '* components  Components\n  customfield_10067  Severity (SLA)\n',
  );
  const json = await cli.mesa('tickets', 'fields', '--search', 'sla', '--json');
  expect(json.json.data).toMatchObject({
    fields: [{ id: 'customfield_10067', name: 'Severity (SLA)' }],
    shown: [{ id: 'components', name: 'Components' }],
  });
  expect((await cli.mesa('tickets', 'fields', 'set', '--clear')).stdout).toContain(
    'Ticket panels show only their own fields',
  );
});

test("mesa tickets views add --provider github follows the project's origin repo, narrowed, and the tab lists, shows and assigns its issues", async () => {
  const world = githubWorld();
  // lantern-cove's origin remote is harbor-co/harbor-api on github.com.
  cli.deps = {
    ...world.deps,
    run: scriptedRunner({
      '/usr/bin/open': world.signIn.open,
      git: (args) =>
        args.includes('get-url') ? 'https://github.com/harbor-co/harbor-api.git\n' : '',
    }).run,
  };
  await cli.withProject();
  await cli.mesa('sources', 'connect', 'github');
  const repo = 'harbor-co/harbor-api';
  world.serveRepo(repo, [{ name: 'bug', color: 'd73a4a' }], [{ number: 3, title: 'v2.4' }]);

  const added = await cli.mesa(
    'tickets',
    'views',
    'add',
    '--provider',
    'github',
    '--project',
    'lantern-cove',
    '--label',
    'bug',
    '--milestone',
    'v2.4',
    '--everyone',
    '--json',
    '--',
    'harbor-api',
  );
  expect(added.json.data).toMatchObject({
    provider: 'github',
    repo,
    labels: ['bug'],
    milestone: 3,
    describe: 'harbor-co, bug, v2.4',
  });
  const jiraOnly = await cli.mesa(
    'tickets',
    'views',
    'add',
    '--provider',
    'github',
    '--board',
    '42',
    '--json',
    '--',
    'x',
  );
  expect(jiraOnly.json.error).toEqual({ code: 'usage', message: '--board: for Jira views only' });

  expect((await cli.mesa('tickets', 'tracker', 'lantern-cove', 'github')).stdout).toBe(
    'lantern-cove tracks work in github\n',
  );
  await cli.mesa('tickets', 'follow', 'lantern-cove', 'harbor-api');
  world.serveIssues(repo, 'state=open&labels=bug&milestone=3', [
    githubIssueObject(repo, 412, 'Tide chart shows UTC', { labels: ['bug'] }),
    githubIssueObject(repo, 413, 'Fix the export', { pr: true }),
  ]);
  expect((await cli.mesa('tickets', 'lantern-cove')).stdout).toBe(
    `harbor-api: harbor-co, bug, v2.4\n\n${repo}#412  Open  Tide chart shows UTC\n`,
  );

  world.serveIssue(repo, githubIssueObject(repo, 412, 'Tide chart shows UTC', { labels: ['bug'] }));
  const shown = await cli.mesa('tickets', 'show', `github:${repo}#412`);
  expect(shown.stdout).toContain(`${repo}#412: Tide chart shows UTC\nOpen · Unassigned · bug\n`);
  world.servePost(`${TEST_GITHUB}/repos/${repo}/issues/412/assignees`, () =>
    githubIssueObject(repo, 412, 'Tide chart shows UTC', { assignees: ['rowan-tide'] }),
  );
  const assigned = await cli.mesa('tickets', 'assign', `github:${repo}#412`, '--json');
  expect(assigned.json.data).toMatchObject({ key: `${repo}#412`, assignee: 'Rowan Tide' });
});

test('mesa tickets views add --provider clickup follows a Folder by its link, and the tab lists, shows and assigns its tasks', async () => {
  const world = clickupWorld();
  cli.deps = { ...world.deps, run: scriptedRunner({ '/usr/bin/open': world.signIn.open }).run };
  await cli.withProject();
  await cli.mesa('sources', 'connect', 'clickup');
  world.serveLocations();
  expect((await cli.mesa('tickets', 'locations')).stdout).toBe(
    [
      'Lantern Cove (ws-1)',
      '  Space Harbor ops (s1)',
      '    Folder Q4 roadmap (f1)',
      '      List Sprint 18 (l1)',
      '    List Inbox (l2)',
      '',
    ].join('\n'),
  );
  expect((await cli.mesa('tickets', 'saved-views')).stdout).toBe(
    'My open tasks: list in Everything (v-mine)\nDock sprint board: board in Harbor ops (v-board)\n',
  );

  const added = await cli.mesa(
    'tickets',
    'views',
    'add',
    '--provider',
    'clickup',
    '--folder',
    'https://app.clickup.com/ws-1/v/f/f1',
    '--everyone',
    '--json',
    '--',
    'Q4 roadmap',
  );
  expect(added.json.data).toMatchObject({
    provider: 'clickup',
    workspace: 'ws-1',
    kind: 'folder',
    id: 'f1',
    title: 'Q4 roadmap',
    describe: 'Harbor ops',
  });
  const githubOnly = await cli.mesa(
    'tickets',
    'views',
    'add',
    '--provider',
    'clickup',
    '--repo',
    'harbor-co/harbor-api',
    '--json',
    '--',
    'x',
  );
  expect(githubOnly.json.error).toEqual({
    code: 'usage',
    message: '--repo: for GitHub Issues views only',
  });

  await cli.mesa('tickets', 'tracker', 'lantern-cove', 'clickup');
  await cli.mesa('tickets', 'follow', 'lantern-cove', 'Q4 roadmap');
  const task = clickupTaskObject('86a1', 'Replace the fender sensors', {
    custom: 'DOCK-112',
    type: 'custom',
    tags: ['hardware'],
  });
  world.serveTasks('/v2/team/ws-1/task?project_ids%5B%5D=f1&subtasks=true', [[task]]);
  expect((await cli.mesa('tickets', 'lantern-cove')).stdout).toBe(
    'Q4 roadmap: Harbor ops\n\nDOCK-112  in progress  Replace the fender sensors\n',
  );
  world.serveTaskObject(task);
  world.serve(`${TEST_CLICKUP}/v2/space/s1`, { name: 'Harbor ops' });
  const shown = await cli.mesa('tickets', 'show', 'clickup:DOCK-112');
  expect(shown.stdout).toContain(
    'DOCK-112: Replace the fender sensors\nin progress · Unassigned · hardware\n',
  );
  world.servePut(`${TEST_CLICKUP}/v2/task/DOCK-112?custom_task_ids=true&team_id=ws-1`, () =>
    clickupTaskObject('86a1', 'Replace the fender sensors', { assignees: ['Rowan Tide'] }),
  );
  const assigned = await cli.mesa('tickets', 'assign', 'clickup:DOCK-112', '--json');
  expect(assigned.json.data).toMatchObject({ key: 'DOCK-112', assignee: 'Rowan Tide' });
});
