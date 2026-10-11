import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { MAX_GOAL_CONDITION } from '../sessions/start/goal-command.js';
import { importProfile, newSession, TEST_JIRA, testStore } from '../testing/index.js';
import type { TicketStart } from './ticket-start.js';

const AGILE = 'https://api.atlassian.com/ex/jira/cloud-1/rest/agile/1.0';
const SITE = 'https://lantern-cove.atlassian.net';
const search = (jql: string) =>
  `${TEST_JIRA}/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,priority&maxResults=100`;

/** lantern-cove with Atlassian connected and LC-12 on its site, assigned to Mira Keel. */
async function setUp() {
  const profile = await importProfile();
  const { world } = profile;
  world.serve(`${TEST_JIRA}/issue/LC-12?expand=renderedFields`, {
    key: 'LC-12',
    fields: {
      summary: 'Fix the tide alarm',
      status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
      priority: { name: 'High' },
      assignee: { displayName: 'Mira Keel', accountId: 'acc-2' },
      labels: ['tides'],
      updated: '2026-09-24T12:00:00Z',
    },
    renderedFields: { description: '<p>The alarm rings <strong>late</strong>.</p>' },
  });
  world.serve(`${TEST_JIRA}/issue/LC-12/comment?expand=renderedBody&startAt=0&maxResults=100`, {
    total: 1,
    comments: [
      {
        author: { displayName: 'Ash Pier' },
        created: '2026-09-23T10:00:00.000+0000',
        renderedBody: '<p>Station 14 again.</p>',
      },
    ],
  });
  return profile;
}

test('show reads one ticket whole, as Markdown, with whose it is and the sessions on it', async () => {
  const { mesa, home } = await setUp();
  const running = testStore(home).create(() =>
    newSession({ project: 'harbor-gate', from: { source: 'jira', id: 'LC-12' } }),
  );
  expect(await mesa.tickets.show('lc-12')).toEqual({
    key: 'LC-12',
    summary: 'Fix the tide alarm',
    status: 'In Progress',
    category: 'indeterminate',
    priority: 'High',
    assignee: { name: 'Mira Keel', accountId: 'acc-2' },
    labels: ['tides'],
    updated: '2026-09-24T12:00:00Z',
    description: 'The alarm rings **late**.',
    comments: [
      {
        author: 'Ash Pier',
        created: '2026-09-23T10:00:00.000+0000',
        markdown: 'Station 14 again.',
      },
    ],
    url: `${SITE}/browse/LC-12`,
    site: 'cloud-1',
    mine: false,
    sessions: [{ id: running.id, project: 'harbor-gate' }],
  });
  await expect(mesa.tickets.show('../etc')).rejects.toThrow('../etc is not a Jira issue key');
});

test('assign puts the ticket on the signed-in account, once, with a receipt', async () => {
  const { mesa, world } = await setUp();
  const assigned: unknown[] = [];
  world.servePut(`${TEST_JIRA}/issue/LC-12/assignee`, (body) => {
    assigned.push(body);
    return {};
  });
  const result = await mesa.tickets.assign('LC-12');
  expect(result).toMatchObject({
    result: { key: 'LC-12', assignee: 'Rowan Tide' },
    receipt: { id: expect.any(String) },
  });
  // The connection's account (atlassianWorld's /me) is who gets it.
  expect(assigned).toEqual([{ accountId: 'acc-1' }]);
});

test('a token without the write scope fails assign alone and keeps the connection', async () => {
  const { mesa, world } = await setUp();
  world.routes[`PUT ${TEST_JIRA}/issue/LC-12/assignee`] = {
    status: 401,
    body: { code: 401, message: 'Unauthorized; scope does not match' },
  };
  await expect(mesa.tickets.assign('LC-12')).rejects.toMatchObject({
    code: 'invalid_config',
    details: { connect: 'atlassian' },
  });
  expect((await mesa.sources.list()).sources[0]).toMatchObject({ status: 'connected' });
  expect((await mesa.tickets.show('LC-12')).summary).toBe('Fix the tide alarm');
});

test("preview counts a view's tickets without saving it", async () => {
  const { mesa, world } = await setUp();
  world.serve(`${AGILE}/board/42/sprint?state=active&maxResults=50`, {
    values: [{ id: 7, name: 'Tide 7', originBoardId: 42 }],
  });
  world.serve(
    search(
      '(sprint = 7) AND assignee = currentUser() AND statusCategory != Done ORDER BY Rank ASC',
    ),
    { issues: [{ key: 'LC-1', fields: { summary: 'Fix the tide alarm' } }] },
  );
  expect(await mesa.tickets.preview({ board: 42 })).toEqual({
    describe: 'Current sprint of board 42 (only mine, not done)',
    jql: '(sprint = 7) AND assignee = currentUser() AND statusCategory != Done ORDER BY Rank ASC',
    count: 1,
    more: false,
    sprints: ['Tide 7'],
  });
  expect(mesa.tickets.views()).toEqual([]);
});

test('each project keeps its own defaults, and a goal takes a prompt by name, none, or the default', async () => {
  const { mesa, world } = await setUp();
  expect(mesa.tickets.defaults('lantern-cove')).toEqual({
    notes: true,
    assign: true,
    start: 'worktree',
  });
  expect(mesa.tickets.setDefaults('lantern-cove', { start: 'checkout', notes: false })).toEqual({
    notes: false,
    assign: true,
    start: 'checkout',
  });
  expect(mesa.tickets.defaults('lantern-cove').start).toBe('checkout');
  expect(() => mesa.tickets.setDefaults('nowhere', { notes: true })).toThrow(
    'no project named nowhere',
  );

  mesa.prompts.save('Ticket flow', 'Branch, test first, open a PR.');
  mesa.prompts.save('Hotfix flow', 'Smallest safe change.');
  mesa.tickets.setPrompt('Ticket flow');
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  await mesa.imports.add('lantern-cove', ['LC-12'], false);
  const goal = async (prompt?: string | null) =>
    (await mesa.imports.goal('lantern-cove', 'LC-12', prompt)).goal;
  expect(await goal()).toMatch(/^Branch, test first/);
  expect(await goal('Hotfix flow')).toMatch(/^Smallest safe change\.\n\nWork on the imported/);
  expect(await goal(null)).toMatch(/^Work on the imported Jira issue LC-12/);
  await expect(goal('Missing')).rejects.toThrow('no saved prompt Missing');

  // A Ticket start: its own prompt around the issue, the Saved prompt after it as Your rules.
  const as = async (start: TicketStart, prompt?: string | null) =>
    (await mesa.imports.goal('lantern-cove', 'LC-12', prompt, start)).goal;
  const session = await as('session', null);
  expect(session).toMatch(/^Load LC-12 as context, then wait for my instructions\./);
  expect(session).toContain('Ticket: LC-12: Fix the tide alarm');
  expect(session).toMatch(/- Snapshot: raw\/jira\/LC-12\/.+\.md/);
  const investigate = await as('investigate', null);
  expect(investigate).toContain('projects/lantern-cove/investigations/LC-12.md');
  expect(investigate).toContain('mesa open lantern-cove --from LC-12 --as goal');
  const built = await as('goal', null);
  expect(built).toMatch(/^\/goal Finish LC-12: do what the ticket asks\./);
  // Room left under the /goal condition's cap for 1500 characters of Your rules.
  expect(built.length + 1500).toBeLessThan(MAX_GOAL_CONDITION);
  expect(await as('goal', 'Hotfix flow')).toMatch(/\n\nMy rules:\nSmallest safe change\.$/);
  // A ticket prompt written as a whole /goal, before the Ticket starts, keeps only its text.
  mesa.prompts.save('Goal flow', '/goal Ship it with a PR.');
  expect(await as('session', 'Goal flow')).toMatch(/\n\nMy rules:\nShip it with a PR\.$/);
  await expect(
    mesa.imports.open('lantern-cove', { from: 'LC-12', exactGoal: true, kind: 'goal' }),
  ).rejects.toMatchObject({ code: 'usage', message: 'pass --exact-goal or --as, not both' });
  // The project's ticket prompt is Your rules too, never what the goal opens with.
  expect(await as('goal')).toMatch(/^\/goal Finish LC-12[\s\S]*Branch, test first, open a PR\.$/);
});

test('defaults written before the Ticket starts load, and the next change drops their untilDone', async () => {
  const { mesa, home } = await setUp();
  const file = `${home}/.mesa/default/tickets.yaml`;
  writeFileSync(file, 'defaults:\n  lantern-cove:\n    notes: false\n    untilDone: true\n');
  expect(mesa.tickets.defaults('lantern-cove')).toEqual({
    notes: false,
    assign: true,
    start: 'worktree',
  });
  mesa.tickets.setDefaults('lantern-cove', { assign: false });
  expect(readFileSync(file, 'utf8')).not.toContain('untilDone');
});

test('a view of a site the connection no longer reaches names the site and asks to reconnect', async () => {
  const { mesa, home } = await setUp();
  await mesa.tickets.addView({ name: 'mine', jql: 'project = LC' });
  mesa.tickets.follow('lantern-cove', 'mine');
  // Signed in again to another account: the view's site is gone from the connection.
  const file = `${home}/.mesa/default/tickets.yaml`;
  writeFileSync(file, readFileSync(file, 'utf8').replace('site: cloud-1', 'site: cloud-9'));
  expect((await mesa.tickets.list('lantern-cove')).views[0]).toMatchObject({
    error: 'Atlassian is signed in to another site: reconnect to lantern-cove to read this view',
    connect: 'atlassian',
  });
});
