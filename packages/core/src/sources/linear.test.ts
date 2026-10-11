import { join } from 'node:path';
import { expect, test } from 'vitest';
import { linearWorld, projectProfile, TEST_BROKER, TEST_LINEAR } from '../testing/index.js';
import { readNote } from '../vault/notes.js';
import type { BrowseResult } from './browse.js';

// Invented ids: workspace org-1 (lantern-cove), team Harbour (HAR), its project, issues, and documents.
const ITEM = 'mesa.default.sources linear';
const SITES = [{ id: 'org-1', name: 'Lantern Cove', url: 'https://linear.app/lantern-cove' }];
const WEB = 'https://linear.app/lantern-cove';
const PROJECT = 'spring-tides-5e1f2a3b4c6d';
const DOCUMENT = 'harbour-rules-9a8b7c6d5e4f';

/** lantern-cove's profile with Linear connected over linearWorld; `sleeps` the waits. */
async function setUp() {
  let now = '2026-09-24T12:00:00.000Z';
  const world = linearWorld();
  const sleeps: number[] = [];
  const { mesa, home } = projectProfile(world.deps.run, {
    ...world.deps,
    clock: () => new Date(now),
    sleep: async (ms) => void sleeps.push(ms),
  });
  const connected = await mesa.sources.connect('linear');
  const browse = (node?: string, query: Record<string, string> = {}): Promise<BrowseResult> =>
    mesa.sources.browse('linear', node, query);
  return {
    world,
    mesa,
    connected,
    browse,
    sleeps,
    vault: join(home, 'vault'),
    at: (iso: string) => {
      now = iso;
    },
  };
}

const ids = (page: BrowseResult) => page.children.map((c) => c.id);
const page = (nodes: unknown[], next?: string) => ({
  nodes,
  pageInfo: { hasNextPage: Boolean(next), endCursor: next ?? null },
});
const issue = (n: number) => ({ identifier: `HAR-${n}`, title: `Tide ${n}` });

test('connect stores the day-long token, its rotating refresh token, and the workspace', async () => {
  const { world, mesa, connected, at } = await setUp();
  expect(connected.result).toEqual({
    id: 'linear',
    label: 'Linear',
    connected: true,
    status: 'connected',
    account: { id: 'user-1', name: 'Rowan Tide', email: 'rowan@example.test' },
    sites: SITES,
  });
  expect(world.signIn.opened[0]).toMatch(`${TEST_BROKER}/authorize/linear?state=`);
  expect(JSON.parse(world.secrets.items.get(ITEM) ?? 'null')).toEqual({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: '2026-09-25T11:59:59.000Z',
    sites: SITES,
    status: 'connected',
  });

  // A day on, the token is refreshed through the broker before the call, and the pair rotates.
  at('2026-09-25T11:59:30.000Z');
  expect((await mesa.sources.list()).sources.find((s) => s.id === 'linear')?.account?.name).toBe(
    'Rowan Tide',
  );
  expect(JSON.parse(world.secrets.items.get(ITEM) ?? 'null')).toMatchObject({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
  });

  world.revoke();
  await expect(mesa.sources.browse('linear', 'workspace:org-1')).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'Linear needs reconnecting: run mesa sources connect linear',
  });
  expect((await mesa.sources.disconnect('linear')).result).toEqual({
    source: 'linear',
    removed: true,
  });
});

test('an issue imports with its description and every comment, a project and a document with theirs; refresh fetches again', async () => {
  const { world, mesa, vault, at } = await setUp();
  const comments = Array.from({ length: 60 }, (_, n) => ({
    by: n % 2 ? 'Rowan Tide' : 'Mara Reef',
    text: `Tide note ${n + 1}`,
  }));
  world.serveIssue('HAR-12', {
    title: 'Chart the spring tide',
    description: '## Plan\n\n- [ ] Read the **gauge**',
    comments,
  });
  world.answer('Project', ({ id }) =>
    id === '5e1f2a3b4c6d'
      ? {
          project: {
            name: 'Spring tides',
            description: 'Charts for the spring.',
            content: '# Goals\n\nEvery buoy read twice a day.',
            updatedAt: '2026-09-23T08:00:00.000Z',
            status: { name: 'In Progress' },
            lead: { name: 'Mara Reef' },
            startDate: '2026-09-01',
            targetDate: null,
            teams: { nodes: [{ name: 'Harbour' }] },
          },
        }
      : undefined,
  );
  world.answer('Document', ({ id }) =>
    id === '9a8b7c6d5e4f'
      ? {
          document: {
            title: 'Harbour rules',
            content: '# Moorings\n\nTie up at the north wall.',
            updatedAt: '2026-09-22T08:00:00.000Z',
          },
        }
      : undefined,
  );
  const links = [
    `${WEB}/issue/har-12/chart-the-spring-tide`,
    `${WEB}/project/${PROJECT}/overview`,
    `${WEB}/document/${DOCUMENT}`,
  ];
  const { result } = await mesa.imports.add('lantern-cove', links, false);
  const snapshot = (id: string) => `raw/linear/${id}/2026-09-24T1200.md`;
  expect(result.items).toEqual([
    {
      source: 'linear',
      id: 'HAR-12',
      title: 'HAR-12: Chart the spring tide',
      url: `${WEB}/issue/HAR-12`,
      snapshot: snapshot('HAR-12'),
    },
    {
      source: 'linear',
      id: 'project.5e1f2a3b4c6d',
      title: 'Spring tides',
      url: `${WEB}/project/${PROJECT}`,
      snapshot: snapshot('project.5e1f2a3b4c6d'),
    },
    {
      source: 'linear',
      id: 'document.9a8b7c6d5e4f',
      title: 'Harbour rules',
      url: `${WEB}/document/${DOCUMENT}`,
      snapshot: snapshot('document.9a8b7c6d5e4f'),
    },
  ]);
  const body = readNote(vault, snapshot('HAR-12')).body;
  expect(body).toContain(
    '- Status: In Progress\n- Team: Harbour\n- Project: Spring tides\n- Cycle: Cycle 4\n- Assignee: Rowan Tide\n- Priority: High\n- Estimate: 3\n- Labels: tides\n',
  );
  expect(body).toContain('## Description\n\n## Plan\n\n- [ ] Read the **gauge**\n\n## Comments');
  // All 60, oldest first, over two pages of comments.
  expect(body.match(/^### /gm)).toHaveLength(60);
  expect(body.indexOf('Tide note 1\n')).toBeLessThan(body.indexOf('Tide note 60'));
  expect(body).toContain('### Mara Reef, 2026-09-21T10:00:00.000Z\n\nTide note 1');
  expect(world.queries.filter((q) => q.operation === 'IssueComments')).toEqual([
    { operation: 'IssueComments', variables: { id: 'HAR-12', after: 'c50' } },
  ]);
  expect(readNote(vault, snapshot('project.5e1f2a3b4c6d')).body).toContain(
    '- Lead: Mara Reef\n- Teams: Harbour\n- Start: 2026-09-01\n- Updated: 2026-09-23T08:00:00.000Z\n\n## Summary\n\nCharts for the spring.\n\n## Description\n\n# Goals\n\nEvery buoy read twice a day.',
  );
  expect(readNote(vault, snapshot('document.9a8b7c6d5e4f'))).toMatchObject({
    frontmatter: { source: 'linear', revision: '2026-09-22T08:00:00.000Z' },
    body: '# Harbour rules\n\n# Moorings\n\nTie up at the north wall.\n',
  });
  // Only reads: every call to Linear is a query.
  expect(
    world.requests
      .filter((r) => r.url === TEST_LINEAR)
      .every((r) => /^\s*query /.test(JSON.parse(r.body ?? '{}').query)),
  ).toBe(true);

  // Changed-only refresh skips all three unchanged; after an edit at the source, the issue refreshes.
  const unchanged = await mesa.imports.refresh('lantern-cove', [], false, { changedOnly: true });
  expect([...(unchanged.result.skipped ?? [])].sort()).toEqual([
    'HAR-12',
    'document.9a8b7c6d5e4f',
    'project.5e1f2a3b4c6d',
  ]);
  world.serveIssue('HAR-12', {
    title: 'Chart the spring tide',
    description: 'Neap tide now.',
    updated: '2026-09-25T09:00:00.000Z',
  });
  at('2026-09-25T09:30:00.000Z');
  const changed = await mesa.imports.refresh('lantern-cove', [], false, { changedOnly: true });
  expect(changed.result.refreshed).toEqual(['HAR-12']);
  expect(readNote(vault, 'raw/linear/HAR-12/2026-09-25T0930.md').body).toContain(
    '## Description\n\nNeap tide now.',
  );
});

test('a link to another workspace, to no item, or to a missing issue says why', async () => {
  const { mesa } = await setUp();
  const add = (link: string) => mesa.imports.add('lantern-cove', [link], false);
  await expect(add('https://linear.app/other-cove/issue/HAR-1')).rejects.toMatchObject({
    code: 'not_found',
    message:
      'other-cove is not the connected Linear workspace (Lantern Cove): reconnect with mesa sources connect linear and pick it',
  });
  // The workspace's URL key in another case is still the connected workspace.
  await expect(add('https://linear.app/Lantern-Cove/issue/HAR-404')).rejects.toThrow(/is missing/);
  await expect(add(`${WEB}/team/HAR/active`)).rejects.toMatchObject({
    code: 'usage',
    message: `${WEB}/team/HAR/active is not a Linear issue, project or document: Mesa imports /<workspace>/issue/<ID>, /project/<slug> and /document/<slug> links`,
  });
  await expect(add(`${WEB}/issue/HAR-404`)).rejects.toMatchObject({
    code: 'not_found',
    message:
      'Linear issue HAR-404 is missing, or not in the connected Linear workspace: reconnect Linear and pick its workspace',
  });
  await mesa.sources.disconnect('linear');
  await expect(add(`${WEB}/issue/HAR-1`)).rejects.toMatchObject({
    message: 'Linear is not connected: run mesa sources connect linear',
  });
});

test('the tree runs workspace > team > All issues or project > issues, page by page, plus Documents', async () => {
  const { world, browse } = await setUp();
  world.answer('Teams', ({ after }) => ({
    teams: after
      ? page([{ id: 'team-2', name: 'Lighthouse', key: 'LGT' }])
      : page([{ id: 'team-1', name: 'Harbour', key: 'HAR' }], 't1'),
  }));
  world.answer('TeamProjects', ({ team, after }) => ({
    team: {
      projects:
        team === 'team-1' && !after
          ? page([{ id: 'proj-1', name: 'Spring tides', url: `${WEB}/project/${PROJECT}` }], 'p1')
          : page([]),
    },
  }));
  world.answer('Issues', ({ filter, after, first }) => {
    expect(first).toBe(25);
    const all = Array.from({ length: 26 }, (_, n) => issue(n + 1));
    const f = filter as { team?: unknown; project?: unknown };
    if (f.project) return { issues: page([issue(7)]) };
    return { issues: after ? page(all.slice(25)) : page(all.slice(0, 25), 'i25') };
  });
  world.answer('Documents', ({ after }) => ({
    documents: after
      ? page([{ id: 'doc-2', title: 'Old log', url: `${WEB}/document/old-log-1a2b3c4d5e6f` }])
      : page([{ id: 'doc-1', title: 'Harbour rules', url: `${WEB}/document/${DOCUMENT}` }], 'd1'),
  }));

  expect((await browse()).children).toEqual([
    {
      id: 'workspace:org-1',
      kind: 'workspace',
      title: 'Lantern Cove',
      url: WEB,
      hasChildren: true,
      importable: false,
    },
  ]);
  const teams = await browse('workspace:org-1');
  expect([ids(teams), teams.cursor]).toEqual([['team:team-1:HAR', 'documents:org-1'], 't1']);
  expect(ids(await browse('workspace:org-1', { cursor: 't1' }))).toEqual(['team:team-2:LGT']);

  const team = await browse('team:team-1:HAR');
  expect([ids(team), team.cursor]).toEqual([['issues:team-1:HAR', 'project:proj-1'], 'p1']);
  expect(team.children).toMatchObject([
    { title: 'All issues', url: `${WEB}/team/HAR/all`, importable: false },
    {
      title: 'Spring tides',
      url: `${WEB}/project/${PROJECT}`,
      importable: true,
      hasChildren: true,
    },
  ]);
  expect(ids(await browse('team:team-1:HAR', { cursor: 'p1' }))).toEqual([]);

  const first = await browse('issues:team-1:HAR');
  expect([first.children.length, first.cursor]).toEqual([25, 'i25']);
  expect(first.children[0]).toEqual({
    id: 'issue:HAR-1',
    kind: 'issue',
    title: 'HAR-1: Tide 1',
    url: `${WEB}/issue/HAR-1`,
    hasChildren: false,
    importable: true,
  });
  const last = await browse('issues:team-1:HAR', { cursor: 'i25' });
  expect([ids(last), last.cursor]).toEqual([['issue:HAR-26'], undefined]);
  expect(ids(await browse('project:proj-1'))).toEqual(['issue:HAR-7']);
  expect(
    world.queries.filter((q) => q.operation === 'Issues').map((q) => q.variables.filter),
  ).toEqual([
    { team: { id: { eq: 'team-1' } } },
    { team: { id: { eq: 'team-1' } } },
    { project: { id: { eq: 'proj-1' } } },
  ]);

  const docs = await browse('documents:org-1');
  expect([docs.children, docs.cursor]).toEqual([
    [
      {
        id: 'document:doc-1',
        kind: 'document',
        title: 'Harbour rules',
        url: `${WEB}/document/${DOCUMENT}`,
        hasChildren: false,
        importable: true,
      },
    ],
    'd1',
  ]);
  expect(ids(await browse('documents:org-1', { cursor: 'd1' }))).toEqual(['document:doc-2']);
});

test('a search is Linear title filter: issues under the root, a team, or a project; documents under Documents', async () => {
  const { world, browse } = await setUp();
  world.answer('Issues', () => ({ issues: page([issue(3)], 'n1') }));
  world.answer('Documents', () => ({ documents: page([]) }));
  const found = await browse(undefined, { search: 'tide' });
  expect([ids(found), found.cursor]).toEqual([['issue:HAR-3'], 'n1']);
  await browse('workspace:org-1', { search: 'tide', cursor: 'n1' });
  await browse('team:team-1:HAR', { search: 'tide' });
  await browse('project:proj-1', { search: 'tide' });
  expect(ids(await browse('documents:org-1', { search: 'rules' }))).toEqual([]);
  const title = { containsIgnoreCase: 'tide' };
  expect(
    world.queries.slice(-5).map((q) => [q.operation, q.variables.filter, q.variables.after]),
  ).toEqual([
    ['Issues', { title }, null],
    ['Issues', { title }, 'n1'],
    ['Issues', { team: { id: { eq: 'team-1' } }, title }, null],
    ['Issues', { project: { id: { eq: 'proj-1' } }, title }, null],
    ['Documents', { title: { containsIgnoreCase: 'rules' } }, null],
  ]);
});

test('a rate-limited query waits until X-RateLimit-Requests-Reset; a node that does not read says so', async () => {
  const { world, browse, sleeps } = await setUp();
  world.answer('Teams', () => ({ teams: page([]) }));
  const served = world.routes[`POST ${TEST_LINEAR}`];
  let limited = true;
  world.routes[`POST ${TEST_LINEAR}`] = (request) => {
    if (!limited || typeof served !== 'function')
      return typeof served === 'function' ? served(request) : { body: {} };
    limited = false;
    // 12:00:00 now; Linear's window resets 7 seconds on, in milliseconds.
    return {
      status: 400,
      headers: { 'x-ratelimit-requests-reset': String(Date.parse('2026-09-24T12:00:07Z')) },
      body: { errors: [{ message: 'Rate limit exceeded', extensions: { code: 'RATELIMITED' } }] },
    };
  };
  expect(ids(await browse('workspace:org-1'))).toEqual(['documents:org-1']);
  expect(sleeps).toEqual([7000]);

  await expect(browse('team:team-1')).rejects.toMatchObject({
    code: 'usage',
    message: 'team:team-1 is not a Linear node: take ids from mesa sources browse linear',
  });
  await expect(browse('workspace:org-9')).rejects.toMatchObject({ code: 'not_found' });
});
