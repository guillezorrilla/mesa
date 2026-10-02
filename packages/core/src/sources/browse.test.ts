import { expect, test } from 'vitest';
import { atlassianWorld, projectProfile, TEST_CONFLUENCE, TEST_JIRA } from '../testing/index.js';
import type { BrowseResult } from './browse.js';

const SITE = 'https://lantern-cove.atlassian.net';
const SEARCH = 'https://api.atlassian.com/ex/confluence/cloud-1/wiki/rest/api/search';

/** lantern-cove's profile with Atlassian connected over atlassianWorld; `sleeps` the waits. */
async function setUp() {
  const world = atlassianWorld();
  const sleeps: number[] = [];
  const { mesa, home } = projectProfile(world.deps.run, {
    ...world.deps,
    sleep: async (ms) => void sleeps.push(ms),
  });
  await mesa.sources.connect('atlassian');
  return { world, mesa, home, sleeps };
}

type Browse = (node?: string, query?: Record<string, string | boolean>) => Promise<BrowseResult>;

/** Every child of `node`, each page's cursor followed to the end, and how many pages it took. */
async function all(browse: Browse, node?: string, search?: string) {
  const children: BrowseResult['children'] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await browse(node, {
      ...(cursor ? { cursor } : {}),
      ...(search ? { search } : {}),
    });
    children.push(...page.children);
    cursor = page.cursor;
    pages += 1;
  } while (cursor);
  return { children, pages };
}

const page = (id: string, title: string, type = 'page') => ({ id, title, type });
const titles = (children: BrowseResult['children']) => children.map((c) => c.title);
const numbered = (from: number, count: number) =>
  Array.from({ length: count }, (_, at) => page(String(from + at), `Tide log ${from + at}`));

test('the root lists the sites, a site its Confluence and Jira, and Confluence its spaces, page by page', async () => {
  const { world, mesa } = await setUp();
  const browse: Browse = (node, query) => mesa.sources.browse('atlassian', node, query);

  expect(await browse()).toEqual({
    node: null,
    children: [
      {
        id: 'site:cloud-1',
        kind: 'site',
        title: 'lantern-cove',
        url: SITE,
        hasChildren: true,
        importable: false,
      },
    ],
  });
  expect((await browse('site:cloud-1')).children).toEqual([
    {
      id: 'confluence:cloud-1',
      kind: 'confluence',
      title: 'Confluence',
      url: `${SITE}/wiki`,
      hasChildren: true,
      importable: false,
    },
    {
      id: 'jira:cloud-1',
      kind: 'jira',
      title: 'Jira',
      url: `${SITE}/jira`,
      hasChildren: true,
      importable: false,
    },
  ]);

  const spaces = Array.from({ length: 30 }, (_, at) => ({
    id: String(100 + at),
    key: `S${at}`,
    name: `Space ${at}`,
  }));
  world.servePaged(`${TEST_CONFLUENCE}/spaces`, [spaces.slice(0, 25), spaces.slice(25)]);
  const first = await browse('confluence:cloud-1');
  expect(first.cursor).toBe('c1');
  expect(first.children[0]).toEqual({
    id: 'space:cloud-1:100:S0',
    kind: 'space',
    title: 'Space 0',
    url: `${SITE}/wiki/spaces/S0`,
    hasChildren: true,
    importable: false,
  });
  const listed = await all(browse, 'confluence:cloud-1');
  expect(listed.pages).toBe(2);
  expect(titles(listed.children)).toEqual(spaces.map((s) => s.name));
});

test('a space lists its top pages and a page its children, pages only, every page of them, each with its import URL', async () => {
  const { world, mesa } = await setUp();
  const browse: Browse = (node, query) => mesa.sources.browse('atlassian', node, query);
  world.servePaged(`${TEST_CONFLUENCE}/spaces/100/pages?depth=root`, [[page('9000', 'Harbour')]]);
  expect(await browse('space:cloud-1:100:LC')).toEqual({
    node: 'space:cloud-1:100:LC',
    children: [
      {
        id: 'page:cloud-1:9000:LC',
        kind: 'page',
        title: 'Harbour',
        url: `${SITE}/wiki/spaces/LC/pages/9000`,
        hasChildren: true,
        importable: true,
      },
    ],
  });

  // 31 children over two pages, a folder among them left out.
  const children = [
    ...numbered(9001, 24),
    page('8000', 'Old logs', 'folder'),
    ...numbered(9025, 6),
  ];
  world.servePaged(`${TEST_CONFLUENCE}/pages/9000/direct-children`, [
    children.slice(0, 25),
    children.slice(25),
  ]);
  const listed = await all(browse, 'page:cloud-1:9000:LC');
  expect(listed.pages).toBe(2);
  expect(listed.children).toHaveLength(30);
  expect(titles(listed.children)).not.toContain('Old logs');
  expect(listed.children.at(-1)).toMatchObject({
    id: 'page:cloud-1:9030:LC',
    url: `${SITE}/wiki/spaces/LC/pages/9030`,
  });

  // A picked page imports by its URL.
  world.servePage('9030', { title: 'Tide log 9030', html: '<p>Calm.</p>' });
  const url = listed.children.at(-1)?.url ?? '';
  const { result } = await mesa.imports.add('lantern-cove', [url], false);
  expect(result.items).toMatchObject([{ source: 'confluence', id: '9030', url }]);
});

test('Jira lists its projects by startAt, and a project its issues by nextPageToken, to the end', async () => {
  const { world, mesa } = await setUp();
  const browse: Browse = (node, query) => mesa.sources.browse('atlassian', node, query);
  const projects = (startAt: number) =>
    `${TEST_JIRA}/project/search?startAt=${startAt}&maxResults=25`;
  world.serve(projects(0), {
    startAt: 0,
    isLast: false,
    values: Array.from({ length: 25 }, (_, at) => ({ key: `P${at}`, name: `Project ${at}` })),
  });
  world.serve(projects(25), {
    startAt: 25,
    isLast: true,
    values: [{ key: 'LC', name: 'Lantern Cove' }],
  });
  const listed = await all(browse, 'jira:cloud-1');
  expect(listed.pages).toBe(2);
  expect(listed.children.at(-1)).toEqual({
    id: 'project:cloud-1:LC',
    kind: 'project',
    title: 'Lantern Cove',
    url: `${SITE}/browse/LC`,
    hasChildren: true,
    importable: false,
  });

  const jql = encodeURIComponent('project = "LC" ORDER BY updated DESC');
  const search = `${TEST_JIRA}/search/jql?jql=${jql}&fields=summary&maxResults=25`;
  world.serve(search, {
    issues: [{ key: 'LC-13', fields: { summary: 'Paint the buoy' } }],
    nextPageToken: 'tok-2',
  });
  world.serve(`${search}&nextPageToken=tok-2`, {
    issues: [{ key: 'LC-12', fields: { summary: 'Fix the tide alarm' } }],
    isLast: true,
  });
  const issues = await all(browse, 'project:cloud-1:LC');
  expect(issues.children).toEqual([
    {
      id: 'issue:cloud-1:LC-13',
      kind: 'issue',
      title: 'LC-13: Paint the buoy',
      url: `${SITE}/browse/LC-13`,
      hasChildren: false,
      importable: true,
    },
    {
      id: 'issue:cloud-1:LC-12',
      kind: 'issue',
      title: 'LC-12: Fix the tide alarm',
      url: `${SITE}/browse/LC-12`,
      hasChildren: false,
      importable: true,
    },
  ]);
});

test('a search looks under its node: CQL in a space, JQL in a project, both from the root', async () => {
  const { world, mesa } = await setUp();
  const browse: Browse = (node, query) => mesa.sources.browse('atlassian', node, query);
  const cql = (q: string) => `${SEARCH}?cql=${encodeURIComponent(q)}`;
  const hit = (id: string, title: string, key = 'LC') => ({
    title,
    url: `/spaces/${key}/pages/${id}/${title.replaceAll(' ', '+')}`,
    content: { id, type: 'page', title },
  });
  world.servePaged(cql('space = "LC" and type = page and title ~ "tide \\"high\\""'), [
    [hit('9001', 'High tide')],
  ]);
  expect((await browse('space:cloud-1:100:LC', { search: 'tide "high"' })).children).toMatchObject([
    { id: 'page:cloud-1:9001:LC', url: `${SITE}/wiki/spaces/LC/pages/9001` },
  ]);

  world.servePaged(cql('ancestor = 9000 and type = page and title ~ "tide"'), [
    [
      hit('9002', 'Low tide'),
      { title: 'A comment', url: '/x', content: { id: '1', type: 'comment', title: 'x' } },
    ],
  ]);
  expect(titles((await browse('page:cloud-1:9000:LC', { search: 'tide' })).children)).toEqual([
    'Low tide',
  ]);

  // From the root: Confluence's two pages of hits, then Jira's one, one combined cursor.
  world.servePaged(cql('type = page and title ~ "tide"'), [
    [hit('9001', 'High tide')],
    [hit('7001', 'Reef tide', 'RF')],
  ]);
  const jql = encodeURIComponent('text ~ "tide" ORDER BY updated DESC');
  world.serve(`${TEST_JIRA}/search/jql?jql=${jql}&fields=summary&maxResults=25`, {
    issues: [{ key: 'LC-12', fields: { summary: 'Fix the tide alarm' } }],
    isLast: true,
  });
  const found = await all(browse, undefined, 'tide');
  expect(found.pages).toBe(2);
  expect(titles(found.children)).toEqual(['High tide', 'LC-12: Fix the tide alarm', 'Reef tide']);
  expect(found.children.at(-1)?.url).toBe(`${SITE}/wiki/spaces/RF/pages/7001`);
});

test('descendants walks the children breadth first, and stops at 200 saying so', async () => {
  const { world, mesa } = await setUp();
  const children = (id: string, pages: ReturnType<typeof page>[]) =>
    world.servePaged(`${TEST_CONFLUENCE}/pages/${id}/direct-children`, [pages]);
  children('9000', [page('9001', 'Tides'), page('9002', 'Winds')]);
  children('9001', [page('9003', 'Spring tides')]);
  children('9002', []);
  children('9003', []);
  const walked = await mesa.sources.browse('atlassian', 'page:cloud-1:9000:LC', {
    descendants: true,
  });
  expect(walked).toEqual({
    node: 'page:cloud-1:9000:LC',
    children: expect.any(Array),
  });
  expect(titles(walked.children)).toEqual(['Tides', 'Winds', 'Spring tides']);

  const many = numbered(10_000, 210);
  world.servePaged(
    `${TEST_CONFLUENCE}/pages/9100/direct-children`,
    Array.from({ length: 9 }, (_, at) => many.slice(at * 25, at * 25 + 25)),
  );
  const capped = await mesa.sources.browse('atlassian', 'page:cloud-1:9100:LC', {
    descendants: true,
  });
  expect(capped.children).toHaveLength(200);
  expect(capped.capped).toBe(true);
  await expect(
    mesa.sources.browse('atlassian', 'page:cloud-1:9100:LC', { descendants: true, cursor: 'c1' }),
  ).rejects.toMatchObject({ code: 'usage' });
});

test('a node that does not read, or a site not connected, says so; no connection says connect', async () => {
  const { mesa } = await setUp();
  for (const node of ['page:cloud-1', 'space:cloud-1:abc:LC', 'board:cloud-1', 'site:']) {
    await expect(mesa.sources.browse('atlassian', node)).rejects.toMatchObject({
      code: 'usage',
      message: `${node} is not an Atlassian node: take ids from mesa sources browse atlassian`,
    });
  }
  await expect(mesa.sources.browse('atlassian', 'jira:cloud-9')).rejects.toMatchObject({
    code: 'not_found',
    message: 'site cloud-9 is not one of the connected Atlassian sites (lantern-cove)',
  });
  await expect(
    mesa.sources.browse('atlassian', undefined, { cursor: 'zz', search: 'x' }),
  ).rejects.toMatchObject({ code: 'usage' });
  await mesa.sources.disconnect('atlassian');
  await expect(mesa.sources.browse('atlassian')).rejects.toMatchObject({
    code: 'not_found',
    details: { connect: 'atlassian' },
  });
});

test('a rate-limited call waits as Retry-After asks and tries again, three times in all', async () => {
  const { world, mesa, sleeps } = await setUp();
  const answers = [
    { status: 429, headers: { 'retry-after': '2' }, body: {} },
    { status: 503, headers: { 'retry-after': '120' }, body: {} },
    { body: { startAt: 0, isLast: true, values: [{ key: 'LC', name: 'Lantern Cove' }] } },
  ];
  const url = `${TEST_JIRA}/project/search?startAt=0&maxResults=25`;
  world.routes[`GET ${url}`] = () => answers.shift() ?? { status: 500, body: {} };
  expect(titles((await mesa.sources.browse('atlassian', 'jira:cloud-1')).children)).toEqual([
    'Lantern Cove',
  ]);
  // Two seconds, then Retry-After's two minutes capped at one.
  expect(sleeps).toEqual([2000, 60_000]);

  world.routes[`GET ${url}`] = { status: 429, body: {} };
  sleeps.length = 0;
  await expect(mesa.sources.browse('atlassian', 'jira:cloud-1')).rejects.toMatchObject({
    message: 'Atlassian is rate limiting Mesa (HTTP 429 3 times): try again in a minute',
  });
  // No Retry-After: one second, then two.
  expect(sleeps).toEqual([1000, 2000]);
  // A 503 that names no wait is an answer, not a limit.
  world.routes[`GET ${url}`] = { status: 503, body: {} };
  await expect(mesa.sources.browse('atlassian', 'jira:cloud-1')).rejects.toMatchObject({
    message: 'Jira projects answered HTTP 503',
  });
});

test('a revoked connection asks to reconnect, naming the source in its details', async () => {
  const { world, mesa } = await setUp();
  world.serve(`${TEST_JIRA}/project/search?startAt=0&maxResults=25`, { startAt: 0, values: [] });
  world.revoke();
  await expect(mesa.sources.browse('atlassian', 'jira:cloud-1')).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'Atlassian needs reconnecting: run mesa sources connect atlassian',
    details: { connect: 'atlassian' },
  });
});
