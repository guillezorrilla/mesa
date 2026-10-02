import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Runner } from '../lib/process.js';
import {
  agentWorld,
  notionDataSourceObject,
  notionPageObject,
  notionWorld,
  projectProfile,
  TEST_BROKER,
  TEST_NOTION,
  writesImportNotes,
} from '../testing/index.js';
import { readNote } from '../vault/notes.js';
import type { BrowseResult } from './browse.js';
import { NOTION_VERSION } from './notion.js';

// Invented ids: a page, its child page, a database (and its one data source), and a row of it.
const PAGE = '1f0c3a5e9b7d4c2a8e6f0b1d2c3e4f5a';
const CHILD = '2a1b3c4d5e6f40718293a4b5c6d7e8f9';
const DB = '4c5d6e7f8091a2b3c4d5e6f708192a3b';
const DS = '5d6e7f8091a2b3c4d5e6f708192a3b4c';
const ROW = '3b4c5d6e7f8091a2b3c4d5e6f7081920';
const dashed = (id: string) =>
  `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
const ITEM = 'mesa.default.sources notion';
const SITES = [{ id: 'ws-1', name: 'Lantern Cove', url: 'https://www.notion.so' }];

/** lantern-cove's profile with Notion connected over notionWorld, and an agent that writes notes. */
async function setUp() {
  let now = '2026-09-24T12:00:00.000Z';
  const world = notionWorld();
  const agents = agentWorld({
    onOpen: writesImportNotes((note, snapshot) => `# ${note}\n\nFrom ${snapshot}.`),
  });
  const run: Runner = (file, ...rest) =>
    file === '/usr/bin/open' ? world.deps.run(file, ...rest) : agents.run(file, ...rest);
  const { mesa, home } = projectProfile(run, { ...world.deps, run, clock: () => new Date(now) });
  const connected = await mesa.sources.connect('notion');
  const browse = (node?: string, query: Record<string, string> = {}): Promise<BrowseResult> =>
    mesa.sources.browse('notion', node, query);
  return {
    world,
    mesa,
    connected,
    browse,
    vault: join(home, 'vault'),
    at: (iso: string) => {
      now = iso;
    },
  };
}

/** Every request to Notion's API is a GET with the pinned version, or a POST to search or query. */
function onlyReads(world: ReturnType<typeof notionWorld>) {
  const toNotion = world.requests.filter((r) => r.url.startsWith(TEST_NOTION));
  expect(toNotion.length).toBeGreaterThan(0);
  for (const request of toNotion) {
    expect(request.headers['notion-version']).toBe(NOTION_VERSION);
    const path = request.url.slice(TEST_NOTION.length);
    if (request.method === 'GET') expect(request.body).toBeUndefined();
    else
      expect([request.method, /^\/(search|data_sources\/[0-9a-f]{32}\/query)$/.test(path)]).toEqual(
        ['POST', true],
      );
  }
}

test('connect stores the tokens with no expiry and the workspace, and lists the bot by its owner', async () => {
  const { world, mesa, connected } = await setUp();
  expect(connected.result).toEqual({
    id: 'notion',
    label: 'Notion',
    connected: true,
    status: 'connected',
    account: { id: 'bot-1', name: 'Rowan Tide' },
    sites: SITES,
  });
  expect(world.requests.find((r) => r.method === 'POST')?.url).toBe(`${TEST_BROKER}/token/notion`);
  expect(JSON.parse(world.secrets.items.get(ITEM) ?? 'null')).toEqual({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    sites: SITES,
    status: 'connected',
  });
  expect(world.secrets.items.get(ITEM)).not.toContain('Rowan');
  expect((await mesa.sources.list()).sources.map((s) => [s.id, s.status])).toEqual([
    ['atlassian', 'disconnected'],
    ['notion', 'connected'],
  ]);
  expect((await mesa.sources.disconnect('notion')).result).toEqual({
    source: 'notion',
    removed: true,
  });
});

test('a token with no expiry refreshes on a 401 and keeps the rotated pair; a refused refresh asks to reconnect', async () => {
  const { world, mesa } = await setUp();
  world.expire();
  expect((await mesa.sources.list()).sources[1]?.account?.name).toBe('Rowan Tide');
  expect(JSON.parse(world.secrets.items.get(ITEM) ?? 'null')).toMatchObject({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
  });
  world.servePostPaged('/search', [[]]);
  world.revoke();
  await expect(mesa.sources.browse('notion', 'workspace:ws-1')).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'Notion needs reconnecting: run mesa sources connect notion',
    details: { connect: 'notion' },
  });
});

test('every form of a Notion link imports the one page; a row lists its properties; refresh fetches again', async () => {
  const { world, mesa, vault, at } = await setUp();
  world.servePage(
    PAGE,
    notionPageObject(dashed(PAGE), 'Mesa import test'),
    `## Tides\nTwice a day, see <mention-page url="https://www.notion.so/${CHILD}">Moon</mention-page>.\n<empty-block/>\n<page url="https://www.notion.so/${CHILD}">Moon</page>\n<database url="https://www.notion.so/${DB}">Log</database>`,
  );
  world.servePage(
    ROW,
    notionPageObject(dashed(ROW), 'Spring tide', {
      database: DB,
      properties: {
        Status: { type: 'status', status: { name: 'Done' } },
        Tags: { type: 'multi_select', multi_select: [{ name: 'moon' }, { name: 'sea' }] },
        Height: { type: 'number', number: 4.2 },
        When: { type: 'date', date: { start: '2026-09-20', end: null } },
        Notes: { type: 'rich_text', rich_text: [] },
      },
    }),
    'High water at noon.',
  );
  const forms = [
    `https://www.notion.so/lantern-cove/Mesa-import-test-${PAGE}`,
    `https://www.notion.so/${dashed(PAGE)}`,
    `https://app.notion.com/p/${PAGE}`,
    `https://www.notion.so/lantern-cove/Mesa-import-test-${PAGE}?pvs=4#top`,
    `https://www.notion.so/lantern-cove/${DB}?v=${CHILD}&p=${PAGE}&pvs=5`,
  ];
  const { result } = await mesa.imports.add(
    'lantern-cove',
    [...forms, `https://notion.so/${ROW}`],
    false,
  );

  const page = `raw/notion/${PAGE}/2026-09-24T1200.md`;
  const row = `raw/notion/${ROW}/2026-09-24T1200.md`;
  expect(result.items).toEqual([
    {
      source: 'notion',
      id: PAGE,
      title: 'Mesa import test',
      url: `https://www.notion.so/${PAGE}`,
      snapshot: page,
    },
    {
      source: 'notion',
      id: ROW,
      title: 'Spring tide',
      url: `https://www.notion.so/${ROW}`,
      snapshot: row,
    },
  ]);
  expect(readNote(vault, page)).toMatchObject({
    frontmatter: { source: 'notion', id: PAGE, url: `https://www.notion.so/${PAGE}` },
    body: `# Mesa import test\n\n## Tides\nTwice a day, see [Moon](https://www.notion.so/${CHILD}).\n[Moon](https://www.notion.so/${CHILD})\n[Log](https://www.notion.so/${DB})\n`,
  });
  expect(readNote(vault, row).body).toBe(
    '# Spring tide\n\n- Status: Done\n- Tags: moon, sea\n- Height: 4.2\n- When: 2026-09-20\n\nHigh water at noon.\n',
  );
  onlyReads(world);
  expect(world.requests.some((r) => r.method === 'POST' && r.url.startsWith(TEST_NOTION))).toBe(
    false,
  );

  // Refresh, with notes this time: a new snapshot of the changed page, and its note.
  world.servePage(PAGE, notionPageObject(dashed(PAGE), 'Mesa import test'), 'Once a day now.');
  at('2026-09-25T09:30:00.000Z');
  const refreshed = await mesa.imports.refresh('lantern-cove', [PAGE]);
  const again = `raw/notion/${PAGE}/2026-09-25T0930.md`;
  expect(refreshed.result.items).toMatchObject([
    { snapshot: again, note: 'wiki/notes/mesa-import-test.md' },
  ]);
  expect(readNote(vault, again).body).toBe('# Mesa import test\n\nOnce a day now.\n');

  // A session starts from it, by its link, with the item's goal and its source on the record.
  const goal = (await mesa.imports.goal('lantern-cove', PAGE)).goal;
  expect(goal.split('\n').slice(0, 2)).toEqual([
    'Work on the imported Notion page Mesa import test',
    `Source: https://www.notion.so/${PAGE}`,
  ]);
  const opened = await mesa.imports.open('lantern-cove', { from: forms[2] ?? '' });
  expect(opened.result).toMatchObject({ goal, from: { source: 'notion', id: PAGE } });
});

test('a Notion link that names no page, is not shared, or has no connection says why and writes nothing', async () => {
  const { world, mesa } = await setUp();
  const refused = (link: string) =>
    mesa.imports
      .add('lantern-cove', [link], false)
      .catch((e) => ({ code: e.code, message: e.message }));
  expect(await refused('https://www.notion.so/lantern-cove')).toEqual({
    code: 'usage',
    message:
      'https://www.notion.so/lantern-cove is not a Notion page: Mesa imports links that end in its id',
  });
  expect(await refused(`https://www.notion.so/${PAGE}`)).toEqual({
    code: 'not_found',
    message: `Notion page ${PAGE} is missing, or not shared with Mesa: share it with Mesa in Notion's Connections menu`,
  });
  await mesa.sources.disconnect('notion');
  expect(await refused(`https://www.notion.so/${PAGE}`)).toEqual({
    code: 'not_found',
    message: 'Notion is not connected: run mesa sources connect notion',
  });
  expect(world.requests.filter((r) => r.url.includes('/pages/'))).toHaveLength(1);
});

test('the root lists the workspace, and the workspace its top pages and databases, page by page', async () => {
  const { world, browse } = await setUp();
  expect(await browse()).toEqual({
    node: null,
    children: [
      {
        id: 'workspace:ws-1',
        kind: 'workspace',
        title: 'Lantern Cove',
        url: 'https://www.notion.so',
        hasChildren: true,
        importable: false,
      },
    ],
  });
  const bodies: unknown[] = [];
  world.servePostPaged(
    '/search',
    [
      [
        notionPageObject(dashed(PAGE), 'Mesa import test'),
        { ...notionPageObject(dashed(CHILD), 'Moon'), parent: { type: 'page_id', page_id: PAGE } },
        notionPageObject(dashed(ROW), 'Spring tide', { database: DB }),
      ],
      [
        notionDataSourceObject(dashed(DS), dashed(DB), 'Tide log'),
        notionDataSourceObject('ds-x', 'db-x', 'Nested', 'page'),
      ],
    ],
    bodies,
  );
  const first = await browse('workspace:ws-1');
  expect(first).toEqual({
    node: 'workspace:ws-1',
    children: [
      {
        id: `page:${PAGE}`,
        kind: 'page',
        title: 'Mesa import test',
        url: `https://www.notion.so/${PAGE}`,
        hasChildren: true,
        importable: true,
      },
    ],
    cursor: 'c1',
  });
  expect((await browse('workspace:ws-1', { cursor: 'c1' })).children).toEqual([
    {
      id: `database:${DS}`,
      kind: 'database',
      title: 'Tide log',
      url: `https://www.notion.so/${DB}`,
      hasChildren: true,
      importable: false,
    },
  ]);
  expect(bodies).toEqual([
    { sort: { timestamp: 'last_edited_time', direction: 'descending' }, page_size: 100 },
    {
      sort: { timestamp: 'last_edited_time', direction: 'descending' },
      page_size: 100,
      start_cursor: 'c1',
    },
  ]);
  onlyReads(world);
});

test('a page lists its child pages and databases, a database its rows, and search finds by title', async () => {
  const { world, browse } = await setUp();
  world.serveBlocks(PAGE, [
    [
      { object: 'block', id: dashed(CHILD), type: 'child_page', child_page: { title: 'Moon' } },
      { object: 'block', id: 'b-1', type: 'paragraph', paragraph: { rich_text: [] } },
    ],
    [
      {
        object: 'block',
        id: dashed(DB),
        type: 'child_database',
        child_database: { title: 'Tide log' },
      },
      {
        object: 'block',
        id: dashed(DS),
        type: 'child_database',
        child_database: { title: 'Not shared' },
      },
    ],
  ]);
  world.serve(`${TEST_NOTION}/databases/${DB}`, {
    object: 'database',
    id: dashed(DB),
    title: [{ plain_text: 'Tide log' }],
    data_sources: [{ id: dashed(DS), name: 'Tide log' }],
  });
  const first = await browse(`page:${PAGE}`);
  expect(first.children.map((c) => [c.id, c.title, c.importable])).toEqual([
    [`page:${CHILD}`, 'Moon', true],
  ]);
  expect(first.cursor).toBe('c1');
  expect((await browse(`page:${PAGE}`, { cursor: 'c1' })).children).toEqual([
    {
      id: `database:${DS}`,
      kind: 'database',
      title: 'Tide log',
      url: `https://www.notion.so/${DB}`,
      hasChildren: true,
      importable: false,
    },
  ]);

  const bodies: unknown[] = [];
  const rows = Array.from({ length: 27 }, (_, at) =>
    notionPageObject(`${String(at).padStart(2, '0')}${ROW.slice(2)}`, `Tide ${at}`, {
      database: DB,
    }),
  );
  world.servePostPaged(`/data_sources/${DS}/query`, [rows.slice(0, 25), rows.slice(25)], bodies);
  const firstRows = await browse(`database:${DS}`);
  expect(firstRows.children).toHaveLength(25);
  expect(firstRows.children[1]).toMatchObject({
    id: `page:01${ROW.slice(2)}`,
    title: 'Tide 1',
    url: `https://www.notion.so/01${ROW.slice(2)}`,
    importable: true,
  });
  const rest = await browse(`database:${DS}`, { cursor: firstRows.cursor ?? '' });
  expect(rest.children.map((c) => c.title)).toEqual(['Tide 25', 'Tide 26']);
  expect(rest.cursor).toBeUndefined();
  expect(bodies).toEqual([{ page_size: 25 }, { page_size: 25, start_cursor: 'c1' }]);

  const searched: unknown[] = [];
  world.servePostPaged(
    '/search',
    [
      [
        notionPageObject(dashed(CHILD), 'Moon'),
        notionDataSourceObject(dashed(DS), dashed(DB), 'Tide log'),
      ],
    ],
    searched,
  );
  expect((await browse(`page:${PAGE}`, { search: 'moon' })).children.map((c) => c.id)).toEqual([
    `page:${CHILD}`,
    `database:${DS}`,
  ]);
  expect(searched).toEqual([{ query: 'moon', page_size: 25 }]);
  onlyReads(world);
});

test('a node that does not read says so', async () => {
  const { browse } = await setUp();
  for (const node of ['page:abc', 'space:ws-1', 'workspace:', `page:${PAGE}:x`]) {
    await expect(browse(node)).rejects.toMatchObject({
      code: 'usage',
      message: `${node} is not a Notion node: take ids from mesa sources browse notion`,
    });
  }
  await expect(browse('workspace:ws-9')).rejects.toMatchObject({ code: 'not_found' });
});
