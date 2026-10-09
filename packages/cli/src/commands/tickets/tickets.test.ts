import { TEST_JIRA } from '@mesa/core/testing';
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

  expect((await cli.mesa('tickets', 'unfollow', 'lantern-cove', 'sprint')).stdout).toContain(
    'lantern-cove follows no ticket views',
  );
  expect((await cli.mesa('tickets', 'views', 'remove', 'sprint')).stdout).toContain(
    'Removed sprint',
  );
  expect((await cli.mesa('tickets', 'views')).stdout).toBe('No ticket views.\n');
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

  world.servePut(`${TEST_JIRA}/issue/LC-12/assignee`, () => ({}));
  expect((await cli.mesa('tickets', 'assign', 'LC-12')).stdout).toContain(
    'Assigned LC-12 to Rowan Tide',
  );

  const preview = await cli.mesa('tickets', 'preview', '--board', '42', '--json');
  expect(preview.json.data).toMatchObject({ count: 1, more: false, sprints: ['Tide 7'] });
  expect((await cli.mesa('tickets', 'preview', '--board', 'x')).code).toBe(2);

  expect((await cli.mesa('tickets', 'defaults', 'lantern-cove')).stdout).toContain(
    'notes on, assign on, start in a new worktree',
  );
  const changed = await cli.mesa(
    'tickets',
    'defaults',
    'lantern-cove',
    '--start',
    'checkout',
    '--notes',
    'off',
    '--json',
  );
  expect(changed.json.data).toEqual({ notes: false, assign: true, start: 'checkout' });
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
