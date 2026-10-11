import { writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import {
  agentWorld,
  githubIssueObject,
  githubWorld,
  projectProfile,
  TEST_BROKER,
  TEST_GITHUB,
  testStore,
} from '../testing/index.js';

const REPO = 'harbor-co/harbor-api';
const ISSUES = `${TEST_GITHUB}/repos/${REPO}/issues`;

/**
 * lantern-cove, whose origin remote is harbor-co/harbor-api on github.com, with GitHub connected
 * and Mesa's GitHub App installed on harbor-api and tide-feed, which has labels and milestones.
 */
async function setUp() {
  const world = githubWorld();
  const agents = agentWorld();
  const run: Runner = async (file, args, ...rest) => {
    if (file === '/usr/bin/open') return world.deps.run(file, args, ...rest);
    if (file === 'git' && args.includes('get-url'))
      return { ok: true, stdout: `git@github.com:${REPO}.git\n` };
    return agents.run(file, args, ...rest);
  };
  const { home, mesa } = projectProfile(run, {
    ...world.deps,
    run,
    clock: () => new Date('2026-09-24T12:00:00.000Z'),
  });
  await mesa.sources.connect('github');
  world.serveRepos(['harbor-co/tide-feed', REPO]);
  world.serveRepo(
    REPO,
    [
      { name: 'bug', color: 'd73a4a' },
      { name: 'backend', color: '0e8a16' },
    ],
    [{ number: 3, title: 'v2.4' }],
  );
  return { world, home, mesa };
}

const ask = (assignees: string[]) => ({ assignees });

test('a GitHub view follows a repo: its issues listed without pull requests, one read whole, and Assign to me adds the person', async () => {
  const { world, mesa } = await setUp();
  // The repos Mesa can read, this project's remote first, and where to give it more.
  expect(await mesa.tickets.repos('lantern-cove')).toEqual({
    repos: [
      { fullName: REPO, private: true, url: `https://github.com/${REPO}`, origin: true },
      expect.objectContaining({ fullName: 'harbor-co/tide-feed', origin: false }),
    ],
    install: 'https://github.com/apps/mesa-for-tickets/installations/new',
  });
  expect(await mesa.tickets.repo(REPO)).toEqual({
    repo: REPO,
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'backend', color: '0e8a16' },
    ],
    milestones: [{ number: 3, title: 'v2.4' }],
  });

  // No repo named: the project's origin remote. The milestone by its title.
  const view = await mesa.tickets.addView({
    provider: 'github',
    name: 'harbor-api',
    project: 'lantern-cove',
    labels: ['bug'],
    milestone: 'v2.4',
  });
  expect(view).toMatchObject({
    provider: 'github',
    repo: REPO,
    labels: ['bug'],
    milestone: 3,
    milestoneTitle: 'v2.4',
    describe: 'harbor-co, bug, v2.4, assigned to me',
  });
  mesa.tickets.setTracker('lantern-cove', 'github');
  mesa.tickets.follow('lantern-cove', 'harbor-api');
  world.serveIssues(REPO, 'state=open&assignee=rowan-tide&labels=bug&milestone=3', [
    githubIssueObject(REPO, 421, 'Berth bookings export drops the last row', {
      assignees: ['mira-keel', 'rowan-tide'],
      labels: ['bug'],
    }),
    githubIssueObject(REPO, 422, 'Retry the export', { pr: true, assignees: ['rowan-tide'] }),
  ]);
  const listed = await mesa.tickets.list('lantern-cove');
  expect(listed).toMatchObject({ tracker: 'github', views: [{ name: 'harbor-api' }] });
  expect(listed.tickets).toEqual([
    {
      id: `github:${REPO}#421`,
      provider: 'github',
      key: `${REPO}#421`,
      summary: 'Berth bookings export drops the last row',
      status: 'Open',
      category: 'new',
      assignee: 'mira-keel',
      assigneeId: '7002',
      assignees: [
        { id: '7002', name: 'mira-keel' },
        { id: '7001', name: 'rowan-tide' },
      ],
      // Assigned beside someone else is still the person's.
      mine: true,
      url: `https://github.com/${REPO}/issues/421`,
      views: ['harbor-api'],
      sessions: [],
    },
  ]);

  // The Follow dialog's live count, and the request Mesa sends, under Advanced.
  world.serveIssues(REPO, 'state=all', [
    githubIssueObject(REPO, 412, 'Tide chart shows UTC', {}),
    githubIssueObject(REPO, 398, 'Upgrade the date library', { state: 'closed' }),
  ]);
  expect(
    await mesa.tickets.preview({
      provider: 'github',
      repo: REPO,
      everyone: true,
      showDone: true,
    }),
  ).toEqual({
    describe: 'harbor-co, all issues',
    jql: `GET /repos/${REPO}/issues?state=all`,
    count: 2,
    more: false,
  });

  world.serveIssue(
    REPO,
    githubIssueObject(REPO, 412, 'Tide chart shows UTC', {
      body: 'Show times in the **harbor** zone.',
      labels: ['bug', 'frontend'],
      milestone: { number: 3, title: 'v2.4' },
    }),
    [{ by: 'mira-keel', body: 'The station config has the zone.' }],
  );
  const shown = await mesa.tickets.show(`github:${REPO}#412`);
  expect(shown).toMatchObject({
    id: `github:${REPO}#412`,
    provider: 'github',
    key: `${REPO}#412`,
    status: 'Open',
    assignees: [],
    labels: [
      { name: 'bug', color: 'd73a4a' },
      { name: 'frontend', color: 'd73a4a' },
    ],
    milestone: 'v2.4',
    repository: REPO,
    description: 'Show times in the **harbor** zone.',
    comments: [
      {
        author: 'mira-keel',
        created: '2026-09-20T10:00:00Z',
        markdown: 'The station config has the zone.',
      },
    ],
    url: `https://github.com/${REPO}/issues/412`,
    mine: false,
    sessions: [],
  });

  // Assign to me adds the person beside the issue's other assignees, with a receipt.
  const sent: unknown[] = [];
  world.servePost(`${ISSUES}/412/assignees`, (body) => {
    sent.push(body);
    return githubIssueObject(REPO, 412, 'Tide chart shows UTC', {
      assignees: ['mira-keel', 'rowan-tide'],
    });
  });
  const assigned = await mesa.tickets.assign(`github:${REPO}#412`);
  expect(sent).toEqual([ask(['rowan-tide'])]);
  expect(assigned.result).toEqual({ key: `${REPO}#412`, assignee: 'Rowan Tide' });
  expect(assigned.receipt).toBeDefined();

  // GitHub drops an assignee it cannot assign, without an error: Mesa says so.
  world.servePost(`${ISSUES}/412/assignees`, () =>
    githubIssueObject(REPO, 412, 'Tide chart shows UTC'),
  );
  await expect(mesa.tickets.assign(`github:${REPO}#412`)).rejects.toThrow(
    `GitHub did not add you to ${REPO}#412`,
  );
  await expect(mesa.tickets.show('github:harbor-api#412')).rejects.toThrow(
    'harbor-api#412 is not a GitHub issue key, owner/repo#123',
  );
});

test('a session started from a GitHub issue imports it through the pipeline, and its Live dot matches by provider and key', async () => {
  const { world, mesa, home } = await setUp();
  await mesa.tickets.addView({ provider: 'github', name: 'harbor-api', repo: REPO, everyone: true });
  mesa.tickets.setTracker('lantern-cove', 'github');
  mesa.tickets.follow('lantern-cove', 'harbor-api');
  const issue = githubIssueObject(REPO, 412, 'Tide chart shows UTC', { body: 'Use the zone.' });
  world.serveIssues(REPO, 'state=open', [issue]);
  world.serveIssue(REPO, issue, [{ by: 'mira-keel', body: 'Seen on station 14.' }]);

  const built = await mesa.imports.open('lantern-cove', {
    from: `${REPO}#412`,
    notes: false,
    kind: 'session',
  });
  expect(built.result.goal).toMatch(/^Load harbor-co\/harbor-api\/412 as context/);
  expect(built.result.goal).toContain(`Ticket: ${REPO}#412: Tide chart shows UTC`);
  expect(built.result.goal).toMatch(/Snapshot: raw\/github\/harbor-co\/harbor-api\/412\/\S+\.md/);
  const record = testStore(home).list().find((r) => r.from?.source === 'github');
  expect(record?.from).toEqual({ source: 'github', id: `${REPO}/412` });
  expect((await mesa.imports.list('lantern-cove')).items).toEqual([
    expect.objectContaining({
      source: 'github',
      id: `${REPO}/412`,
      title: `${REPO}#412: Tide chart shows UTC`,
      url: `https://github.com/${REPO}/issues/412`,
    }),
  ]);
  const [ticket] = (await mesa.tickets.list('lantern-cove')).tickets;
  expect(ticket?.sessions).toEqual([{ id: record?.id, project: 'lantern-cove' }]);
});

test('switching a project to GitHub keeps its Jira views, unlisted, and switching back restores them', async () => {
  const { world, mesa, home } = await setUp();
  writeFileSync(
    `${home}/.mesa/default/tickets.yaml`,
    [
      'views:',
      '  - name: sprint',
      '    site: cloud-1',
      '    siteName: lantern-cove',
      '    board: 42',
      '    sprint: current',
      'follows:',
      '  lantern-cove: [sprint]',
      '',
    ].join('\n'),
  );
  expect((await mesa.tickets.list('lantern-cove')).tracker).toBe('jira');

  mesa.tickets.setTracker('lantern-cove', 'github');
  const empty = await mesa.tickets.list('lantern-cove');
  expect(empty).toMatchObject({ tracker: 'github', views: [], tickets: [] });
  await mesa.tickets.addView({ provider: 'github', name: 'harbor-api', repo: REPO });
  mesa.tickets.follow('lantern-cove', 'harbor-api');
  world.serveIssues(REPO, 'state=open&assignee=rowan-tide', []);
  expect((await mesa.tickets.list('lantern-cove')).views.map((v) => v.name)).toEqual([
    'harbor-api',
  ]);
  // A Jira view is not followed while the project tracks GitHub.
  expect(() => mesa.tickets.follow('lantern-cove', 'sprint')).toThrow(
    'lantern-cove tracks work in GitHub Issues, and sprint is a Jira view',
  );

  mesa.tickets.setTracker('lantern-cove', 'jira');
  const back = await mesa.tickets.list('lantern-cove');
  // Atlassian is not connected here, so the view asks to connect; it is back all the same.
  expect(back).toMatchObject({ tracker: 'jira', connect: 'atlassian', views: [{ name: 'sprint' }] });
  expect(mesa.tickets.views().map((v) => [v.name, v.provider, v.following])).toEqual([
    ['sprint', 'jira', ['lantern-cove']],
    ['harbor-api', 'github', ['lantern-cove']],
  ]);
});

test('an 8-hour GitHub token refreshes on expiry, and a refresh GitHub refuses asks to reconnect', async () => {
  const { world, mesa } = await setUp();
  world.expire();
  expect((await mesa.tickets.repos()).repos).toHaveLength(2);
  // GitHub refuses a used or expired refresh token with HTTP 200 and an error.
  world.routes[`POST ${TEST_BROKER}/token/github`] = { body: { error: 'bad_refresh_token' } };
  world.expire();
  await expect(mesa.tickets.repos()).rejects.toThrow('GitHub needs reconnecting');
  expect((await mesa.sources.list()).sources.find((s) => s.id === 'github')).toMatchObject({
    status: 'needs-reconnect',
  });
});
