import { join } from 'node:path';
import { expect, test } from 'vitest';
import { clickupWorld, projectProfile, TEST_BROKER, TEST_CLICKUP } from '../testing/index.js';
import { readNote } from '../vault/notes.js';
import type { BrowseResult } from './browse.js';

// Invented ids: Workspace ws-1, its space, folder and lists, tasks, and a Doc with two pages.
const ITEM = 'mesa.default.sources clickup';
const SITES = [{ id: 'ws-1', name: 'Lantern Cove', url: 'https://app.clickup.com/ws-1' }];
const DOC = '2kx9-100';
const PAGE = '2kx9-200';
const SUBPAGE = '2kx9-300';
const DOC_PAGE = `${TEST_CLICKUP}/v3/workspaces/ws-1/docs/${DOC}/pages/${PAGE}?content_format=text/md`;
const LISTING = `${TEST_CLICKUP}/v3/workspaces/ws-1/docs/${DOC}/page_listing`;

/** lantern-cove's profile with ClickUp connected over clickupWorld; `sleeps` the waits. */
async function setUp() {
  let now = '2026-09-24T12:00:00.000Z';
  const world = clickupWorld();
  const sleeps: number[] = [];
  const { mesa, home } = projectProfile(world.deps.run, {
    ...world.deps,
    clock: () => new Date(now),
    sleep: async (ms) => void sleeps.push(ms),
  });
  const connected = await mesa.sources.connect('clickup');
  const browse = (node?: string, query: Record<string, string> = {}): Promise<BrowseResult> =>
    mesa.sources.browse('clickup', node, query);
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
const task = (id: string, name: string) => ({ id, name, custom_id: null });

test('connect stores an access token with no refresh token or expiry, and the Workspace', async () => {
  const { world, mesa, connected } = await setUp();
  expect(connected.result).toEqual({
    id: 'clickup',
    label: 'ClickUp',
    connected: true,
    status: 'connected',
    account: { id: '101', name: 'Rowan Tide', email: 'rowan@example.test' },
    sites: SITES,
  });
  expect(world.signIn.opened).toEqual([
    `${TEST_BROKER}/authorize/clickup?state=${new URL(world.signIn.opened[0] ?? '').searchParams.get('state')}`,
  ]);
  expect(JSON.parse(world.secrets.items.get(ITEM) ?? 'null')).toEqual({
    accessToken: 'access-1',
    sites: SITES,
    status: 'connected',
  });
  expect((await mesa.sources.disconnect('clickup')).result).toEqual({
    source: 'clickup',
    removed: true,
  });
});

test('a Workspace not given to Mesa is not found; a revoked token asks to reconnect, with no refresh', async () => {
  const { world, mesa } = await setUp();
  world.routes[`GET ${TEST_CLICKUP}/v2/task/86other?include_markdown_description=true`] = {
    status: 401,
    body: { err: 'Team not authorized', ECODE: 'OAUTH_027' },
  };
  await expect(
    mesa.imports.add('lantern-cove', ['https://app.clickup.com/t/86other'], false),
  ).rejects.toMatchObject({
    code: 'not_found',
    message:
      'ClickUp task 86other is missing, or in a Workspace Mesa was not given: reconnect ClickUp and pick that Workspace',
  });
  expect(JSON.parse(world.secrets.items.get(ITEM) ?? 'null').status).toBe('connected');

  world.serve(`${TEST_CLICKUP}/v2/team/ws-1/space?archived=false`, { spaces: [] });
  world.revoke();
  await expect(mesa.sources.browse('clickup', 'workspace:ws-1')).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'ClickUp needs reconnecting: run mesa sources connect clickup',
    details: { connect: 'clickup' },
  });
  expect(world.requests.filter((r) => r.url.startsWith(`${TEST_BROKER}/token`))).toHaveLength(1);
  expect((await mesa.sources.list()).sources.find((s) => s.id === 'clickup')?.status).toBe(
    'needs-reconnect',
  );
});

test('a task imports with its Markdown description and every comment, a Doc page with its content; refresh fetches again', async () => {
  const { world, mesa, vault, at } = await setUp();
  const comments = Array.from({ length: 26 }, (_, n) => ({
    by: n % 2 ? 'Rowan Tide' : 'Mara Reef',
    text: `Tide note ${n + 1}`,
  }));
  world.serveTask('86tide1', {
    name: 'Chart the spring tide',
    markdown: '## Plan\n\n- [ ] Read the **gauge**',
    comments,
  });
  world.serve(DOC_PAGE, {
    id: PAGE,
    doc_id: DOC,
    name: 'Harbour rules',
    content: '# Moorings\n\nTie up at the north wall.',
    date_updated: 1790000000000,
  });
  const links = [
    'https://app.clickup.com/t/86tide1',
    `https://app.clickup.com/ws-1/v/dc/${DOC}/${PAGE}`,
  ];
  const { result } = await mesa.imports.add('lantern-cove', links, false);
  const taskSnapshot = 'raw/clickup/86tide1/2026-09-24T1200.md';
  const pageSnapshot = `raw/clickup/${DOC}.${PAGE}/2026-09-24T1200.md`;
  expect(result.items).toEqual([
    {
      source: 'clickup',
      id: '86tide1',
      title: 'Chart the spring tide',
      url: links[0],
      snapshot: taskSnapshot,
    },
    {
      source: 'clickup',
      id: `${DOC}.${PAGE}`,
      title: 'Harbour rules',
      url: links[1],
      snapshot: pageSnapshot,
    },
  ]);
  const body = readNote(vault, taskSnapshot).body;
  expect(body).toContain(
    '- Status: in progress\n- List: Tide charts\n- Assignees: Rowan Tide\n- Tags: tides\n',
  );
  expect(body).toContain('## Description\n\n## Plan\n\n- [ ] Read the **gauge**\n\n## Comments');
  // All 26, oldest first, over two pages of comments.
  expect(body.match(/^### /gm)).toHaveLength(26);
  expect(body.indexOf('Tide note 1\n')).toBeLessThan(body.indexOf('Tide note 26'));
  expect(body).toContain('### Mara Reef, 2026-09-21T');
  expect(readNote(vault, pageSnapshot)).toMatchObject({
    frontmatter: { source: 'clickup', id: `${DOC}.${PAGE}`, revision: '1790000000000' },
    body: '# Harbour rules\n\n# Moorings\n\nTie up at the north wall.\n',
  });
  expect(world.requests.every((r) => r.method === 'GET' || r.url.startsWith(TEST_BROKER))).toBe(
    true,
  );

  // Changed-only refresh skips both unchanged; after an edit at the source, the task refreshes.
  world.requests.length = 0;
  const unchanged = await mesa.imports.refresh('lantern-cove', [], false, { changedOnly: true });
  expect([...(unchanged.result.skipped ?? [])].sort()).toEqual([`${DOC}.${PAGE}`, '86tide1']);
  expect(world.requests.some((r) => r.url.includes('/comment'))).toBe(false);
  world.serveTask('86tide1', {
    name: 'Chart the spring tide',
    markdown: 'Neap tide now.',
    updated: '1790000600000',
  });
  at('2026-09-25T09:30:00.000Z');
  const changed = await mesa.imports.refresh('lantern-cove', [], false, { changedOnly: true });
  expect(changed.result.refreshed).toEqual(['86tide1']);
  expect(readNote(vault, 'raw/clickup/86tide1/2026-09-25T0930.md').body).toContain(
    '## Description\n\nNeap tide now.',
  );
});

test('a custom task id link names its Workspace; a link that is no task or page says why', async () => {
  const { world, mesa } = await setUp();
  world.serve(
    `${TEST_CLICKUP}/v2/task/TIDE-7?include_markdown_description=true&custom_task_ids=true&team_id=ws-1`,
    { id: '86tide7', custom_id: 'TIDE-7', name: 'Buoy check', date_updated: '1790000000000' },
  );
  world.serve(`${TEST_CLICKUP}/v2/task/TIDE-7/comment?custom_task_ids=true&team_id=ws-1`, {
    comments: [],
  });
  const { result } = await mesa.imports.add(
    'lantern-cove',
    ['https://app.clickup.com/t/ws-1/TIDE-7'],
    false,
  );
  expect(result.items[0]).toMatchObject({
    id: 'TIDE-7',
    title: 'TIDE-7: Buoy check',
    url: 'https://app.clickup.com/t/ws-1/TIDE-7',
  });
  await expect(
    mesa.imports.add('lantern-cove', ['https://app.clickup.com/ws-1/v/li/901'], false),
  ).rejects.toMatchObject({
    code: 'usage',
    message:
      'https://app.clickup.com/ws-1/v/li/901 is not a ClickUp task or Doc page: Mesa imports /t/<task id> and /<workspace>/v/dc/<doc>/<page> links',
  });
  await mesa.sources.disconnect('clickup');
  await expect(
    mesa.imports.add('lantern-cove', ['https://app.clickup.com/t/86tide1'], false),
  ).rejects.toMatchObject({
    message: 'ClickUp is not connected: run mesa sources connect clickup',
  });
});

test('the tree runs Workspace > space > folder > list > tasks, page by page, plus Docs and their pages', async () => {
  const { world, browse } = await setUp();
  const api = TEST_CLICKUP;
  world.serve(`${api}/v2/team/ws-1/space?archived=false`, {
    spaces: [{ id: 's1', name: 'Harbour' }],
  });
  world.serve(`${api}/v2/space/s1/folder?archived=false`, {
    folders: [{ id: 'f1', name: 'Tides' }],
  });
  world.serve(`${api}/v2/space/s1/list?archived=false`, { lists: [{ id: 'l2', name: 'Inbox' }] });
  world.serve(`${api}/v2/folder/f1/list?archived=false`, { lists: [{ id: 'l1', name: 'Charts' }] });
  const many = Array.from({ length: 100 }, (_, n) => task(`86t${n}`, `Tide ${n}`));
  world.serve(`${api}/v2/list/l1/task?page=0&include_closed=true`, {
    tasks: many,
    last_page: false,
  });
  world.serve(`${api}/v2/list/l1/task?page=1&include_closed=true`, {
    tasks: [task('86t100', 'Tide 100')],
    last_page: true,
  });
  world.serve(`${api}/v3/workspaces/ws-1/docs?limit=25`, {
    docs: [{ id: DOC, name: 'Harbour handbook' }],
    next_cursor: 'd2',
  });
  world.serve(`${api}/v3/workspaces/ws-1/docs?limit=25&cursor=d2`, {
    docs: [{ id: '2kx9-101', name: 'Old log' }],
  });
  world.serve(LISTING, [
    {
      id: PAGE,
      doc_id: DOC,
      name: 'Harbour rules',
      pages: [{ id: SUBPAGE, doc_id: DOC, name: 'Night moorings', pages: [] }],
    },
  ]);

  expect((await browse()).children).toEqual([
    {
      id: 'workspace:ws-1',
      kind: 'workspace',
      title: 'Lantern Cove',
      url: 'https://app.clickup.com/ws-1',
      hasChildren: true,
      importable: false,
    },
  ]);
  expect(ids(await browse('workspace:ws-1'))).toEqual(['space:ws-1:s1', 'docs:ws-1']);
  expect(ids(await browse('space:ws-1:s1'))).toEqual(['folder:ws-1:f1', 'list:ws-1:l2']);
  expect(ids(await browse('folder:ws-1:f1'))).toEqual(['list:ws-1:l1']);
  const first = await browse('list:ws-1:l1');
  expect([first.children.length, first.cursor]).toEqual([100, '1']);
  expect(first.children[0]).toEqual({
    id: 'task:ws-1:86t0',
    kind: 'task',
    title: 'Tide 0',
    url: 'https://app.clickup.com/t/86t0',
    hasChildren: false,
    importable: true,
  });
  const last = await browse('list:ws-1:l1', { cursor: '1' });
  expect([ids(last), last.cursor]).toEqual([['task:ws-1:86t100'], undefined]);

  const docs = await browse('docs:ws-1');
  expect([ids(docs), docs.cursor]).toEqual([[`doc:ws-1:${DOC}`], 'd2']);
  expect(ids(await browse('docs:ws-1', { cursor: 'd2' }))).toEqual(['doc:ws-1:2kx9-101']);
  const pages = await browse(`doc:ws-1:${DOC}`);
  expect(pages.children).toEqual([
    {
      id: `page:ws-1:${DOC}:${PAGE}`,
      kind: 'page',
      title: 'Harbour rules',
      url: `https://app.clickup.com/ws-1/v/dc/${DOC}/${PAGE}`,
      hasChildren: true,
      importable: true,
    },
  ]);
  expect(ids(await browse(`page:ws-1:${DOC}:${PAGE}`))).toEqual([`page:ws-1:${DOC}:${SUBPAGE}`]);
});

test('a search keeps the names that hold it: tasks under a node, Docs under Docs, pages in a Doc', async () => {
  const { world, browse } = await setUp();
  const team = `${TEST_CLICKUP}/v2/team/ws-1/task`;
  world.serve(`${team}?page=0&include_closed=true&list_ids%5B%5D=l1`, {
    tasks: [task('86a', 'Spring tide'), task('86b', 'Buoy')],
    last_page: false,
  });
  world.serve(`${team}?page=1&include_closed=true&list_ids%5B%5D=l1`, {
    tasks: [task('86c', 'Neap TIDE')],
    last_page: true,
  });
  world.serve(`${team}?page=0&include_closed=true&space_ids%5B%5D=s1`, {
    tasks: [task('86a', 'Spring tide')],
    last_page: true,
  });
  world.serve(`${team}?page=0&include_closed=true`, {
    tasks: [task('86a', 'Spring tide'), task('86d', 'Gull count')],
    last_page: true,
  });
  world.serve(`${TEST_CLICKUP}/v3/workspaces/ws-1/docs?limit=25`, {
    docs: [
      { id: DOC, name: 'Tide handbook' },
      { id: '2kx9-101', name: 'Old log' },
    ],
  });
  world.serve(LISTING, [
    { id: PAGE, name: 'Harbour rules', pages: [{ id: SUBPAGE, name: 'Tide tables' }] },
  ]);

  const list = await browse('list:ws-1:l1', { search: 'tide' });
  expect([ids(list), list.cursor]).toEqual([['task:ws-1:86a'], '1']);
  expect(ids(await browse('list:ws-1:l1', { search: 'tide', cursor: '1' }))).toEqual([
    'task:ws-1:86c',
  ]);
  expect(ids(await browse('space:ws-1:s1', { search: 'tide' }))).toEqual(['task:ws-1:86a']);
  expect(ids(await browse(undefined, { search: 'gull' }))).toEqual(['task:ws-1:86d']);
  expect(ids(await browse('docs:ws-1', { search: 'tide' }))).toEqual([`doc:ws-1:${DOC}`]);
  expect(ids(await browse(`doc:ws-1:${DOC}`, { search: 'tide' }))).toEqual([
    `page:ws-1:${DOC}:${SUBPAGE}`,
  ]);
});

test('a rate-limited call waits until X-RateLimit-Reset; a node that does not read says so', async () => {
  const { world, browse, sleeps } = await setUp();
  const url = `${TEST_CLICKUP}/v2/folder/f1/list?archived=false`;
  // 12:00:00 now; ClickUp's window resets 7 seconds on.
  const answers = [
    {
      status: 429,
      headers: { 'x-ratelimit-reset': String(Date.parse('2026-09-24T12:00:07Z') / 1000) },
      body: {},
    },
    { body: { lists: [] } },
  ];
  world.routes[`GET ${url}`] = () => answers.shift() ?? { status: 500, body: {} };
  expect(ids(await browse('folder:ws-1:f1'))).toEqual([]);
  expect(sleeps).toEqual([7000]);

  await expect(browse('folder:ws-1')).rejects.toMatchObject({
    code: 'usage',
    message: 'folder:ws-1 is not a ClickUp node: take ids from mesa sources browse clickup',
  });
  await expect(browse('space:ws-9:s1')).rejects.toMatchObject({ code: 'not_found' });
});
