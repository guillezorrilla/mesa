import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { meaningfulReceipt } from '../receipts/policy.js';
import { listReceipts } from '../receipts/store.js';
import {
  finishesRun,
  importProfile,
  TEST_BROKER,
  TEST_CONFLUENCE,
  TEST_JIRA,
  thrown,
  writesImportNotes,
} from '../testing/index.js';
import { readNote } from '../vault/notes.js';

const SITE = 'https://lantern-cove.atlassian.net';
const PAGE_URL = `${SITE}/wiki/spaces/LC/pages/9001/Tide+schedule`;
const KEPT = '<!-- keep -->\n## Mine\nCall the harbour master first.\n<!-- keep -->';

const files = (dir: string) => (existsSync(dir) ? readdirSync(dir) : []);

test('a Jira key and a Confluence URL import as snapshots and notes linked from the hub, with one receipt and only reads', async () => {
  const { world, agents, mesa, vault } = await importProfile();
  world.serveIssue('LC-12', {
    summary: 'Fix the tide alarm',
    description: '<p>The alarm rings <strong>late</strong>.</p>',
    comments: [
      { by: 'Rowan Tide', html: '<p>Seen twice.</p>' },
      { by: 'Ada Reef', html: '<p>It is the clock.</p>' },
      { by: 'Rowan Tide', html: '<p>Fixed in the <a href="/browse/LC-13">next one</a>.</p>' },
    ],
  });
  world.servePage('9001', {
    title: 'Tide schedule',
    html: '<h2>High tide</h2><p>Twice a day.</p>',
    parentId: '9000',
  });
  world.servePage('9000', { title: 'Harbour' });

  const { result, receipt } = await mesa.imports.add('lantern-cove', ['LC-12', PAGE_URL]);

  const jira = 'raw/jira/LC-12/2026-09-24T1200.md';
  const page = 'raw/confluence/9001/2026-09-24T1200.md';
  const jiraNote = 'wiki/notes/lc-12-fix-the-tide-alarm.md';
  const pageNote = 'wiki/notes/tide-schedule.md';
  expect(result).toEqual({
    project: 'lantern-cove',
    items: [
      {
        source: 'jira',
        id: 'LC-12',
        title: 'LC-12: Fix the tide alarm',
        url: `${SITE}/browse/LC-12`,
        snapshot: jira,
        note: jiraNote,
      },
      {
        source: 'confluence',
        id: '9001',
        title: 'Tide schedule',
        url: `${SITE}/wiki/spaces/LC/pages/9001`,
        snapshot: page,
        note: pageNote,
      },
    ],
    notes: { ok: true, session: expect.any(String) },
  });
  const snapshot = readNote(vault, jira);
  expect(snapshot.frontmatter).toEqual({
    created: '2026-09-24T12:00',
    updated: '2026-09-24T12:00',
    source: 'jira',
    project: 'lantern-cove',
    url: `${SITE}/browse/LC-12`,
    id: 'LC-12',
    title: 'LC-12: Fix the tide alarm',
    fetched: '2026-09-24T12:00',
    revision: '2026-09-24T12:00:00Z',
  });
  expect(snapshot.body).toContain('- Status: In Progress\n- Labels: tides');
  expect(snapshot.body).toContain('## Description\n\nThe alarm rings **late**.');
  // Every comment, across both pages, its links made absolute.
  expect(snapshot.body).toContain('### Ada Reef, 2026-09-21T10:00:00.000+0000\n\nIt is the clock.');
  expect(snapshot.body).toContain(`[next one](${SITE}/browse/LC-13)`);
  expect(readNote(vault, page).body).toBe(
    '# Tide schedule\n\nAncestors: Harbour\n\n## High tide\n\nTwice a day.\n',
  );

  // One run, its prompt naming each snapshot and the note it becomes, with no vault writes.
  const launch = agents.calls.find((c) => c.args.some((a) => a.includes('/import-notes')));
  const line = launch?.args.find((a) => a.startsWith('exec '));
  expect(line).toContain(`'/import-notes ${jira}=${jiraNote} ${page}=${pageNote}'`);
  expect(line).toContain(
    "--disallowedTools 'mcp__mesa-vault__save_decision' 'mcp__mesa-vault__save_summary' 'mcp__mesa-vault__save_note' --allowedTools",
  );
  expect(readNote(vault, jiraNote)).toEqual({
    frontmatter: {
      created: '2026-09-24T12:00',
      updated: '2026-09-24T12:00',
      source: 'mesa',
      type: 'import',
      project: 'lantern-cove',
      url: `${SITE}/browse/LC-12`,
      snapshot: '[[raw/jira/LC-12/2026-09-24T1200]]',
    },
    body: `# ${jiraNote}\n\nFrom ${jira}.\n`,
  });
  expect(readNote(vault, 'projects/lantern-cove.md').body).toBe(
    `# lantern-cove\n\n<!-- keep -->\n## Imported\n\n- [[wiki/notes/lc-12-fix-the-tide-alarm]]: LC-12: Fix the tide alarm\n- [[wiki/notes/tide-schedule]]: Tide schedule\n<!-- keep -->\n`,
  );
  expect(readFileSync(join(vault, 'index.md'), 'utf8')).toContain(
    '- [[wiki/notes/tide-schedule]]: Tide schedule\n',
  );

  const receipts = listReceipts(vault).filter((e) => e.receipt.kind === 'vault-change');
  expect(receipts).toHaveLength(1);
  expect(receipts[0]?.receipt).toMatchObject({
    id: receipt?.id,
    project: 'lantern-cove',
    outputs: { items: result.items, notes: { ok: true }, target: jiraNote },
  });
  expect(readFileSync(join(vault, 'log.md'), 'utf8')).toContain(
    'Imported LC-12, 9001 into lantern-cove',
  );

  // Nothing but reads went to Atlassian: the broker alone takes a POST, for the token.
  const toSources = world.requests.filter((r) => !r.url.startsWith(TEST_BROKER));
  expect(toSources.length).toBeGreaterThan(5);
  expect(toSources.every((r) => r.method === 'GET' && r.body === undefined)).toBe(true);
});

test('a public web page imports cleaned by Defuddle with notes off: one snapshot, no connection, no run', async () => {
  const { world, agents, mesa, vault } = await importProfile();
  world.routes['GET https://example.test/tides?week=40'] = {
    html: '<html><head><title>Tide tables</title></head><body><nav><a href="/">Home</a> <a href="/shop">Shop</a></nav><article><h1>Tide tables</h1><p>The tide at <a href="/cove">the cove</a> turns twice a day, and the table below lists the times for the whole week ahead.</p><p>Check it before you sail.</p></article><footer>Copyright Example</footer></body></html>',
  };
  await mesa.sources.disconnect('atlassian');

  const { result } = await mesa.imports.add(
    'lantern-cove',
    ['https://example.test/tides?week=40#top'],
    false,
  );

  const path = 'raw/web/example-test-tides-week-40/2026-09-24T1200.md';
  expect(result).toEqual({
    project: 'lantern-cove',
    items: [
      {
        source: 'web',
        id: 'example-test-tides-week-40',
        title: 'Tide tables',
        url: 'https://example.test/tides?week=40',
        snapshot: path,
      },
    ],
  });
  const { body, frontmatter } = readNote(vault, path);
  expect(frontmatter).toMatchObject({ source: 'web', id: 'example-test-tides-week-40' });
  expect(body).toContain('The tide at [the cove](https://example.test/cove) turns twice a day');
  expect(body).not.toContain('Shop');
  expect(body).not.toContain('Copyright');
  expect(agents.tmux.opened).toEqual([]);
  expect(files(join(vault, 'wiki/notes'))).toEqual([]);
});

test("an import's progress shows while it runs, a second import into the project waits, and it ends with none", async () => {
  const { world, mesa } = await importProfile();
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  world.serveIssue('LC-13', { summary: 'Paint the buoys', description: '<p>Faded.</p>' });
  expect(mesa.imports.status('lantern-cove')).toEqual({ project: 'lantern-cove', progress: null });

  const running = mesa.imports.add('lantern-cove', ['LC-12', 'LC-13'], false);
  expect(mesa.imports.status('lantern-cove').progress).toMatchObject({ phase: 'fetching' });
  expect((await mesa.imports.add('lantern-cove', ['LC-12'], false).catch((e) => e)).code).toBe(
    'locked',
  );
  await running;
  expect(mesa.imports.status('lantern-cove').progress).toBeNull();
});

test('a refresh after a kept-block edit and a source change has the new content and the edit, and a new snapshot', async () => {
  // The agent drops the person's block and makes one of its own: core keeps exactly the person's.
  let says = 'The alarm rings late.';
  const { world, mesa, vault, at } = await importProfile(
    () => `# Tide alarm\n\n${says}\n\n<!-- keep -->\nAgent block.\n<!-- keep -->`,
  );
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  await mesa.imports.add('lantern-cove', ['LC-12']);
  const note = 'wiki/notes/lc-12-fix-the-tide-alarm.md';
  expect(readNote(vault, note).body).toBe('# Tide alarm\n\nThe alarm rings late.\n');
  const file = join(vault, note);
  writeFileSync(file, readFileSync(file, 'utf8').replace('late.\n', `late.\n\n${KEPT}\n`));

  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Early now.</p>' });
  says = 'The alarm rings early now.';
  at('2026-09-25T09:30:00.000Z');
  const { result } = await mesa.imports.refresh('lantern-cove');

  expect(result.items.map((i) => [i.snapshot, i.note])).toEqual([
    ['raw/jira/LC-12/2026-09-25T0930.md', note],
  ]);
  expect(readNote(vault, note).body).toBe(
    `# Tide alarm\n\nThe alarm rings early now.\n\n${KEPT}\n`,
  );
  expect(files(join(vault, 'raw/jira/LC-12'))).toEqual([
    '2026-09-24T1200.md',
    '2026-09-25T0930.md',
  ]);
  expect(readNote(vault, 'raw/jira/LC-12/2026-09-24T1200.md').body).toContain('Late.');
  expect(readNote(vault, 'raw/jira/LC-12/2026-09-25T0930.md').body).toContain('Early now.');
  // The hub links the note once.
  expect(readNote(vault, 'projects/lantern-cove.md').body.match(/lc-12-fix/g)).toHaveLength(1);
  expect(mesa.imports.list('lantern-cove').items).toEqual([
    {
      source: 'jira',
      id: 'LC-12',
      url: `${SITE}/browse/LC-12`,
      title: 'LC-12: Fix the tide alarm',
      fetched: '2026-09-25T09:30',
      snapshot: 'raw/jira/LC-12/2026-09-25T0930.md',
      note,
    },
  ]);
});

test('a failed Write notes run leaves the snapshots, changes no note, and says why', async () => {
  const { world, mesa, vault, at, agent } = await importProfile();
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  await mesa.imports.add('lantern-cove', ['LC-12']);
  const note = 'wiki/notes/lc-12-fix-the-tide-alarm.md';
  const before = [note, 'projects/lantern-cove.md', 'index.md'].map((p) =>
    readFileSync(join(vault, p), 'utf8'),
  );
  agent(finishesRun({ output: '', status: 1, stderr: 'claude: not logged in' }));
  at('2026-09-25T09:30:00.000Z');

  const { result, receipt } = await mesa.imports.refresh('lantern-cove', ['LC-12']);

  expect(result.notes).toMatchObject({
    ok: false,
    reason: 'claude printed no result; claude exited with status 1; claude: not logged in',
  });
  expect(result.items[0]).not.toHaveProperty('note');
  expect(
    [note, 'projects/lantern-cove.md', 'index.md'].map((p) => readFileSync(join(vault, p), 'utf8')),
  ).toEqual(before);
  expect(existsSync(join(vault, 'raw/jira/LC-12/2026-09-25T0930.md'))).toBe(true);
  // The snapshot is a change, so it keeps its receipt.
  expect(receipt).not.toBeNull();

  // An agent that leaves a note out lands none of them.
  agent(writesImportNotes(() => ''));
  const missing = await mesa.imports.refresh('lantern-cove');
  expect(missing.result.notes).toMatchObject({
    ok: false,
    reason: `the import-notes run returned no note for ${note}`,
  });
  expect(readFileSync(join(vault, note), 'utf8')).toBe(before[0]);
});

test('an unsupported, unconnected, or inaccessible link says why and writes nothing', async () => {
  const { world, mesa, vault } = await importProfile();
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  const refused = async (links: string[]) => {
    const error = await mesa.imports.add('lantern-cove', links).catch((e) => e);
    return { code: error.code, message: error.message };
  };
  expect(await refused(['LC-12', `${SITE}/browse/LC-99`])).toEqual({
    code: 'not_found',
    message: 'Jira issue LC-99 is missing, or not shared with you',
  });
  expect(await refused([`${SITE}/jira/software/projects/LC/boards/1`])).toMatchObject({
    code: 'usage',
    message: expect.stringMatching(/is not a Jira issue or a Confluence page/),
  });
  expect(await refused(['https://other-site.atlassian.net/browse/OT-1'])).toMatchObject({
    code: 'not_found',
    message: expect.stringMatching(/other-site.atlassian.net is not one of the connected/),
  });
  expect(await refused(['ftp://example.test/tides'])).toMatchObject({ code: 'usage' });
  expect(await refused(['the tides'])).toEqual({
    code: 'usage',
    message: 'the tides is not a link or a Jira issue key',
  });
  await mesa.sources.disconnect('atlassian');
  expect(await refused(['LC-12'])).toEqual({
    code: 'not_found',
    message: 'Atlassian is not connected: run mesa sources connect atlassian',
  });
  expect(files(join(vault, 'raw'))).toEqual([]);
  expect(files(join(vault, 'wiki/notes'))).toEqual([]);
  expect(thrown(() => mesa.imports.list('nowhere')).message).toBe(
    'no project named nowhere; see mesa projects',
  );
  expect(await mesa.imports.refresh('lantern-cove', ['LC-1'], false).catch((e) => e.message)).toBe(
    'lantern-cove imported no LC-1; see mesa import list --project lantern-cove',
  );
});

test('a bare key on a connection with two sites names them', async () => {
  const { world, mesa } = await importProfile();
  const sites = [
    { id: 'cloud-1', name: 'lantern-cove', url: SITE },
    { id: 'cloud-2', name: 'reef-watch', url: 'https://reef-watch.atlassian.net' },
  ];
  const [item] = [...world.secrets.items.keys()];
  const stored = JSON.parse(world.secrets.items.get(item ?? '') ?? '{}');
  world.secrets.items.set(item ?? '', JSON.stringify({ ...stored, sites }));
  const error = await mesa.imports.add('lantern-cove', ['LC-12']).catch((e) => e);
  expect(error.message).toBe(
    "LC-12 could be on any of lantern-cove, reef-watch: paste the issue's URL instead",
  );
});

test('Write notes runs on a profile whose skills list predates import-notes, and leaves that list as it is', async () => {
  const { world, mesa, home } = await importProfile();
  mesa.config.set('skills', '[mesa]');
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  const { result } = await mesa.imports.add('lantern-cove', ['LC-12']);
  expect(result.notes).toMatchObject({ ok: true });
  expect(result.items[0]?.note).toBe('wiki/notes/lc-12-fix-the-tide-alarm.md');
  // Linked for its own run, while the profile's list and the project's skills stay as they were.
  expect(existsSync(join(home, 'src/lantern-cove/.claude/skills/import-notes/SKILL.md'))).toBe(
    true,
  );
  expect(mesa.config.get().skills).toEqual(['mesa']);
  expect(mesa.skills.list('lantern-cove').find((s) => s.name === 'import-notes')?.enabled).toBe(
    false,
  );
});

test("Write notes relinks a deleted checkout's import-notes link, and fails clearly on the project's own", async () => {
  const { world, agents, mesa, home } = await importProfile();
  world.serveIssue('LC-12', { summary: 'Fix the tide alarm', description: '<p>Late.</p>' });
  const skills = join(home, 'src/lantern-cove/.claude/skills');
  mkdirSync(skills, { recursive: true });
  symlinkSync(join(home, 'mesa-399/skills/import-notes'), join(skills, 'import-notes'));
  const { result } = await mesa.imports.add('lantern-cove', ['LC-12']);
  expect(result.notes).toMatchObject({ ok: true });
  expect(existsSync(join(skills, 'import-notes/SKILL.md'))).toBe(true);
  expect(readlinkSync(join(skills, 'import-notes'))).not.toContain('mesa-399');

  // An entry of the project's own holds its place: no run, and the reason.
  const runs = () => agents.calls.filter((c) => c.args.some((a) => a.includes('/import-notes')));
  const before = runs().length;
  rmSync(join(skills, 'import-notes'));
  mkdirSync(join(skills, 'import-notes'));
  const own = await mesa.imports.refresh('lantern-cove');
  expect(own.result.notes).toEqual({
    ok: false,
    reason:
      "lantern-cove has a skill entry of its own named import-notes, so the run would not load Mesa's; rename or remove its .claude/skills/import-notes or .agents/skills/import-notes",
  });
  expect(runs()).toHaveLength(before);
});

test('Write notes takes 50 items of the longest paths in one run, and refuses 51 before fetching any', async () => {
  const { world, agents, mesa, vault } = await importProfile();
  // Each a web page whose slug and title fill the 80 characters of both paths.
  const links = Array.from(
    { length: 51 },
    (_, at) => `https://example.test/${String(at).padStart(2, '0')}${'x'.repeat(90)}`,
  );
  for (const link of links) {
    world.routes[`GET ${link}`] = {
      html: `<html><head><title>${link.slice(20)}</title></head><body><article><p>The tide table for the week ahead, page ${link.slice(20, 22)}.</p></article></body></html>`,
    };
  }
  const error = await mesa.imports.add('lantern-cove', links).catch((e) => e);
  expect(error).toMatchObject({
    code: 'usage',
    message:
      'Write notes takes at most 50 items in one import, and this one has 51: import them in batches, or with Write notes off (--no-notes)',
  });
  expect(world.requests.some((r) => r.url.startsWith('https://example.test/'))).toBe(false);
  expect(files(join(vault, 'raw'))).toEqual([]);

  const { result } = await mesa.imports.add('lantern-cove', links.slice(0, 50));
  expect(result.notes).toMatchObject({ ok: true });
  expect(result.items.every((i) => i.note?.length === 'wiki/notes/.md'.length + 80)).toBe(true);
  expect(agents.calls.filter((c) => c.args.some((a) => a.includes('/import-notes')))).toHaveLength(
    1,
  );
});

test('changed-only refresh skips native revisions, refreshes changes with kept text, and seeds legacy snapshots once', async () => {
  let says = 'Old tide';
  const { world, mesa, vault, agents } = await importProfile(() => `# Tide\n\n${says}`);
  world.serveIssue('LC-12', { summary: 'Tide', description: '<p>Old.</p>' });
  world.servePage('9001', { title: 'Schedule', html: '<p>Old.</p>' });
  await mesa.imports.add('lantern-cove', ['LC-12', PAGE_URL]);
  const old = mesa.imports.list('lantern-cove').items;
  const note = old.find((r) => r.id === 'LC-12')?.note as string;
  writeFileSync(join(vault, note), `${readFileSync(join(vault, note), 'utf8')}\n${KEPT}\n`);
  const before = old.map((r) => readFileSync(join(vault, r.snapshot), 'utf8'));
  const runCount = agents.calls.filter((c) =>
    c.args.some((a) => a.includes('/import-notes')),
  ).length;
  world.requests.length = 0;
  const unchanged = await mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true });
  expect(unchanged.result).toMatchObject({
    checked: ['9001', 'LC-12'],
    skipped: ['9001', 'LC-12'],
    refreshed: [],
    items: [],
  });
  expect(unchanged.result.notes).toBeUndefined();
  expect(unchanged.receipt).not.toBeNull();
  const receipt = listReceipts(vault).find((r) => r.receipt.id === unchanged.receipt?.id)?.receipt;
  expect(receipt?.outputs).toMatchObject({
    checked: ['9001', 'LC-12'],
    skipped: ['9001', 'LC-12'],
    refreshed: [],
  });
  expect(receipt && meaningfulReceipt(receipt)).toBe(false);
  expect(world.requests.map((r) => r.url)).toEqual([
    `${TEST_CONFLUENCE}/pages/9001`,
    `${TEST_JIRA}/issue/LC-12?fields=updated`,
  ]);
  expect(agents.calls.filter((c) => c.args.some((a) => a.includes('/import-notes')))).toHaveLength(
    runCount,
  );
  expect(old.map((r) => readFileSync(join(vault, r.snapshot), 'utf8'))).toEqual(before);
  expect(mesa.imports.list('lantern-cove').items).toEqual(old);

  says = 'New tide';
  world.serveIssue('LC-12', {
    summary: 'Tide',
    description: '<p>New.</p>',
    updated: '2026-09-25T12:00:00Z',
  });
  const changed = await mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true });
  expect(changed.result).toMatchObject({
    skipped: ['9001'],
    refreshed: ['LC-12'],
    notes: { ok: true },
  });
  expect(readNote(vault, note).body).toBe(`# Tide\n\nNew tide\n\n${KEPT}\n`);
  expect(readNote(vault, changed.result.items[0]?.snapshot as string).frontmatter.revision).toBe(
    '2026-09-25T12:00:00Z',
  );
  const current = changed.result.items[0]?.snapshot as string;
  writeFileSync(
    join(vault, current),
    readFileSync(join(vault, current), 'utf8').replace(/^revision:.*\n/m, ''),
  );
  const seeded = await mesa.imports.refresh('lantern-cove', ['LC-12'], false, {
    changedOnly: true,
  });
  expect(seeded.result.refreshed).toEqual(['LC-12']);
  const again = await mesa.imports.refresh('lantern-cove', ['LC-12'], false, { changedOnly: true });
  expect(again.result.skipped).toEqual(['LC-12']);
  world.servePage('9001', { title: 'Schedule', html: '<p>New schedule.</p>', version: 2 });
  expect(
    (await mesa.imports.refresh('lantern-cove', ['9001'], false, { changedOnly: true })).result
      .refreshed,
  ).toEqual(['9001']);
});

test('changed-only refresh preflights every item before snapshots, and batches only changed notes at 50 with a safe agent default', async () => {
  const { world, mesa, vault, agents, agent, home } = await importProfile();
  const links = Array.from({ length: 51 }, (_, n) => `https://example.test/tide-${n}`);
  const serve = (value: string) => {
    for (const link of links)
      world.routes[`GET ${link}`] = {
        html: `<html><head><title>${link.slice(21)}</title></head><body><article><p>${value} tide tables for the week ahead.</p></article></body></html>`,
      };
  };
  serve('Old');
  await mesa.imports.add('lantern-cove', links, false);
  const before = mesa.imports.list('lantern-cove').items;
  serve('New');
  delete world.routes[`GET ${links[0]}`]; // Latest-first ordering makes this the last check.
  await expect(
    mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(mesa.imports.list('lantern-cove').items).toEqual(before);
  expect(files(join(vault, 'wiki/notes'))).toEqual([]);
  serve('New');
  mesa.config.set('defaultAgent', 'antigravity');
  agent(finishesRun({ output: '', status: 1, stderr: 'temporary provider failure' }));
  const failed = await mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true });
  expect(failed.result.refreshed).toHaveLength(51);
  expect(failed.result.notes?.ok).toBe(false);
  const snapshots = mesa.imports.list('lantern-cove').items;
  const pendingFile = join(home, '.mesa/default/pending-import-notes.yaml');
  expect(readFileSync(pendingFile, 'utf8').match(/url:/g)).toHaveLength(51);
  const launchedBefore = agents.calls.length;
  const owed = readFileSync(pendingFile, 'utf8');
  expect(
    (await mesa.imports.refresh('lantern-cove', [], false, { changedOnly: true })).result.notes,
  ).toBeUndefined();
  delete world.routes[`GET ${links[0]}`];
  await expect(
    mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(readFileSync(pendingFile, 'utf8')).toBe(owed);
  expect(agents.calls.length).toBe(launchedBefore);
  serve('New');
  agent(writesImportNotes((note) => `# ${note}\n\nRecovered tide.`));
  const changed = await mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true });
  expect(changed.result.refreshed).toEqual([]);
  expect(changed.result.skipped).toHaveLength(51);
  expect(changed.result.notesRetried).toHaveLength(51);
  expect(mesa.imports.list('lantern-cove').items.map((i) => i.snapshot)).toEqual(
    snapshots.map((i) => i.snapshot),
  );
  expect(readFileSync(pendingFile, 'utf8').trim()).toBe('[]');
  expect(changed.result.notesRuns).toHaveLength(2);
  expect(changed.result.notesRuns?.every((r) => r.ok)).toBe(true);
  expect(changed.result.items.every((i) => i.note)).toBe(true);
  const launches = agents.calls
    .slice(launchedBefore)
    .flatMap((c) => c.args.filter((a) => a.includes("'/import-notes ")));
  expect(launches).toHaveLength(2);
  expect(launches.map((l) => l.match(/raw\/web\//g)?.length)).toEqual([50, 1]);
  expect(launches.every((l) => l.includes('claude'))).toBe(true);
  expect(
    (await mesa.imports.refresh('lantern-cove', [], true, { changedOnly: true })).result.skipped,
  ).toHaveLength(51);
  expect(
    agents.calls
      .slice(launchedBefore)
      .flatMap((c) => c.args.filter((a) => a.includes("'/import-notes "))),
  ).toHaveLength(2);
  await expect(
    mesa.imports.refresh('lantern-cove', [], true, {
      changedOnly: true,
      agent: 'antigravity' as 'claude',
    }),
  ).rejects.toMatchObject({ code: 'usage' });
});
