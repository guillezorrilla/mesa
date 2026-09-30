import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newSession, shortIds, testStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('vault init lays out the vault once; vault status finds what is missing', async () => {
  await mesa('init', '--vault', 'vault');
  // Routine setup leaves no receipt.
  expect((await mesa('vault', 'init')).stdout).toBe(
    `created log.md, AGENTS.md, index.md, raw, wiki, projects, receipts, daily in ${cli.home}/vault\n`,
  );
  const log = readFileSync(join(cli.home, 'vault/log.md'), 'utf8').split('\n');
  expect(log[0]).toBe('- 2026-09-24T12:00:00.000Z vault initialised by mesa');
  expect(log[1]).toBe('');
  expect((await mesa('vault', 'init')).stdout).toBe('vault already initialised\n');
  expect((await mesa('vault', 'status', '--json')).json.data).toEqual({
    path: `${cli.home}/vault`,
    ok: true,
    missing: [],
  });

  rmSync(join(cli.home, 'vault/receipts'), { recursive: true });
  const status = await mesa('vault', 'status', '--json');
  expect(status.code).toBe(3);
  expect(status.json.data).toMatchObject({ ok: false, missing: ['receipts'] });

  const group = await mesa('vault');
  expect(group.code).toBe(2);
  expect(group.stderr).toContain('vault init');
  expect(group.stderr).toContain('vault status');
});

test('vault init refuses a non-empty folder that is not a vault unless --force', async () => {
  mkdirSync(join(cli.home, 'repo'));
  writeFileSync(join(cli.home, 'repo/README.md'), 'a repo\n');
  await mesa('init', '--vault', 'repo');
  expect((await mesa('vault', 'init')).code).toBe(4);
  expect((await mesa('vault', 'init', '--force')).code).toBe(0);
  expect(readFileSync(join(cli.home, 'repo/README.md'), 'utf8')).toBe('a repo\n');
});

test('log appends to log.md and to the daily note it creates', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('log', 'hello')).code).toBe(3); // the vault is not laid out yet
  await mesa('vault', 'init');
  const out = await mesa('log', 'hello', '--json');
  expect(out.code).toBe(0);
  expect(out.json.data.entry).toBe('- 2026-09-24T12:00:00.000Z hello');
  expect(readFileSync(join(cli.home, 'vault/log.md'), 'utf8').trimEnd().split('\n').at(-1)).toBe(
    '- 2026-09-24T12:00:00.000Z hello',
  );
  const daily = readFileSync(join(cli.home, 'vault', out.json.data.daily), 'utf8');
  expect(daily).toMatch(/^---\ncreated: /);
  expect(daily.trimEnd().endsWith('- 2026-09-24T12:00:00.000Z hello')).toBe(true);
  expect((await mesa('log')).code).toBe(2);
});

test('init, register, and vault init leave no routine receipt; receipts still validates queries', async () => {
  await mesa('init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'tide'));
  await mesa('register', 'tide', '--create');
  await mesa('vault', 'init');
  await mesa('vault', 'init'); // nothing to do: no receipt

  const listed = await mesa('receipts', '--json', '--limit', '20');
  expect(listed.json.data).toEqual([]);
  expect((await mesa('receipts', 'show', '01NOPE')).code).toBe(3);
  expect(await mesa('receipts', '--limit', 'zero')).toMatchObject({
    code: 2,
    stderr: '--limit must be a whole number, not zero\n',
  });
  expect(await mesa('receipts', '--limit', '0')).toMatchObject({
    code: 2,
    stderr: 'the limit must be a positive whole number, not 0\n',
  });
  expect((await mesa('receipts', '--limit', '1', '--json')).json.data).toEqual([]);
});

test('a vault path that is not a vault omits routine receipts without warnings', async () => {
  mkdirSync(join(cli.home, 'repo/.git'), { recursive: true });
  writeFileSync(join(cli.home, 'repo/README.md'), 'a repo\n');
  const out = await mesa('init', '--vault', 'repo');
  expect(out.code).toBe(0);
  expect(out.stdout).not.toContain('warning:');
  expect(() => readFileSync(join(cli.home, 'repo/receipts'))).toThrow();
  const json = await mesa('--profile', 'json', 'init', '--vault', 'repo', '--json');
  expect(json.json.data).toMatchObject({
    receipt: null,
  });

  await mesa('--profile', 'work', 'init', '--vault', 'vault');
  mkdirSync(join(cli.home, 'nomesa'));
  expect((await mesa('--profile', 'work', 'register', 'nomesa')).code).toBe(3);
  const listed = await mesa('--profile', 'work', 'receipts', '--json');
  expect(listed.json.data).toEqual([]);
});

test('a routine action stays quiet when vault history cannot be written', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(cli.home, 'tide'));
  chmodSync(join(cli.home, 'vault/log.md'), 0o000); // acceptsMesaWrites cannot read the log mark
  try {
    const ok = await mesa('register', 'tide', '--create');
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain('registered tide');
    expect(ok.stdout).not.toContain('warning:');
    const missing = await mesa('register', 'nowhere');
    expect(missing.code).toBe(3); // the real error, not the receipt's
  } finally {
    chmodSync(join(cli.home, 'vault/log.md'), 0o644);
  }
});

test('vault open: the URI by default, --json, and its errors', async () => {
  // No profile yet: the same error every command gives.
  const before = await mesa('vault', 'open');
  expect([before.code, before.stderr]).toEqual([
    3,
    `${cli.paths.config} not found; run mesa init --vault <path>\n`,
  ]);
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  // A config that does not read says why, as vault status does, not "no vault".
  const config = cli.paths.config;
  const good = readFileSync(config, 'utf8');
  writeFileSync(config, `${good}surprise: 1\n`);
  const broken = await mesa('vault', 'open');
  expect(broken.code).toBe(4);
  expect(broken.stderr).toMatch(/config\.yaml.*surprise/);
  writeFileSync(config, good);
  const list = join(cli.home, 'obsidian/obsidian.json');
  mkdirSync(join(cli.home, 'obsidian'), { recursive: true });
  writeFileSync(list, JSON.stringify({ vaults: { a1: { path: join(cli.home, 'vault'), ts: 1 } } }));

  const opened = await mesa('vault', 'open', '--json');
  expect(opened.json).toEqual({
    ok: true,
    data: { opened: true, method: 'uri', target: 'obsidian://open?vault=vault' },
  });
  const { daily } = (await mesa('log', 'hello', '--json')).json.data;
  const note = await mesa('vault', 'open', daily, '--json');
  expect(note.json.data.target).toBe(
    `obsidian://open?vault=vault&file=${encodeURIComponent(daily)}`,
  );
  expect((await mesa('vault', 'open', 'wiki/missing.md')).code).toBe(3);
});

test('vault list: every item as {vault, total, items}, filtered by --project and --type', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const vault = join(cli.home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(join(vault, path, '..'), { recursive: true });
    writeFileSync(join(vault, path), text);
  };
  put('projects/tide.md', '# Tide\n');
  put('wiki/currents.md', '---\nproject: tide\n---\nCurrents.\n');
  put('receipts/2026/09/20260924T120000Z-decision-01K62V4Q8J3M5N7P9R1S2T3V4W.md', 'Chose.\n');
  put('raw/chart.png', 'png');
  put('.obsidian/app.json', '{}');

  const listed = await mesa('vault', 'list', '--json');
  expect(listed.code).toBe(0);
  expect(listed.json.data).toMatchObject({ vault, total: 7 });
  expect(listed.json.data.items.map((i: { path: string }) => i.path)).toEqual([
    'AGENTS.md',
    'index.md',
    'log.md',
    'projects/tide.md',
    'raw/chart.png',
    'receipts/2026/09/20260924T120000Z-decision-01K62V4Q8J3M5N7P9R1S2T3V4W.md',
    'wiki/currents.md',
  ]);
  expect(listed.json.data.items[3]).toEqual({
    path: 'projects/tide.md',
    kind: 'markdown',
    category: 'projects',
    project: 'tide',
    size: 7,
    modified: expect.any(String),
  });

  const receipts = await mesa('vault', 'list', '--type', 'receipts', '--json');
  expect(receipts.json.data.total).toBe(1);
  const tide = await mesa('vault', 'list', '--project', 'tide', '--type', 'markdown', '--json');
  expect(tide.json.data.items.map((i: { path: string }) => i.path)).toEqual([
    'projects/tide.md',
    'wiki/currents.md',
  ]);
  expect((await mesa('vault', 'list', '--project', 'tide')).stdout).toBe(
    `markdown  projects  tide  projects/tide.md\nmarkdown  wiki      tide  wiki/currents.md\n2 items in ${vault}\n`,
  );
  expect(await mesa('vault', 'list', '--type', 'notes')).toMatchObject({ code: 2 });

  rmSync(vault, { recursive: true });
  const missing = await mesa('vault', 'list');
  expect([missing.code, missing.stderr]).toEqual([
    3,
    `vault ${vault} does not exist; run mesa vault init\n`,
  ]);
});

test('vault read: a note with its links and backlinks, a canvas, and an attachment, as JSON and text', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const vault = join(cli.home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(join(vault, path, '..'), { recursive: true });
    writeFileSync(join(vault, path), text);
  };
  put(
    'wiki/currents.md',
    '---\nproject: tide\n---\nSee [[tide]], ![[chart.png]] and [[eddies]].\n',
  );
  put('projects/tide.md', '# Tide\n\n[[currents]]\n');
  put('raw/chart.png', 'png');
  put('projects/tide/map.canvas', '{"nodes":[{"id":"a","type":"text","text":"Ebb"}],"edges":[]}');

  const note = await mesa('vault', 'read', 'wiki/currents.md', '--json');
  expect(note.code).toBe(0);
  expect(note.json.data).toMatchObject({
    path: 'wiki/currents.md',
    kind: 'markdown',
    project: 'tide',
    modified: expect.any(String),
    uri: 'obsidian://open?vault=vault&file=wiki%2Fcurrents.md',
    preview: 'markdown',
    frontmatter: { project: 'tide' },
    body: 'See [[tide]], ![[chart.png]] and [[eddies]].\n',
    backlinks: ['projects/tide.md'],
  });
  expect(note.json.data.links).toEqual([
    {
      text: '[[tide]]',
      start: 4,
      end: 12,
      syntax: 'wikilink',
      embed: false,
      target: 'tide',
      status: 'resolved',
      path: 'projects/tide.md',
    },
    expect.objectContaining({ embed: true, status: 'resolved', path: 'raw/chart.png' }),
    expect.objectContaining({ text: '[[eddies]]', status: 'broken' }),
  ]);
  expect((await mesa('vault', 'read', 'wiki/currents.md')).stdout).toBe(
    [
      'wiki/currents.md (markdown)',
      'project  tide',
      '',
      'See [[tide]], ![[chart.png]] and [[eddies]].',
      '',
      'links:',
      '  resolved  [[tide]]        projects/tide.md',
      '  resolved  ![[chart.png]]  raw/chart.png',
      '  broken    [[eddies]]',
      'backlinks:',
      '  projects/tide.md',
      'open: obsidian://open?vault=vault&file=wiki%2Fcurrents.md',
      '',
    ].join('\n'),
  );

  const canvas = await mesa('vault', 'read', 'projects/tide/map.canvas', '--json');
  expect(canvas.json.data).toMatchObject({ preview: 'canvas', nodes: 1, edges: 0, texts: ['Ebb'] });
  const png = await mesa('vault', 'read', 'raw/chart.png', '--json');
  expect(png.json.data).toMatchObject({
    kind: 'attachment',
    preview: 'unsupported',
    reason: 'Mesa does not preview images, audio, video, or PDFs',
    uri: 'obsidian://open?vault=vault&file=raw%2Fchart.png',
    backlinks: ['wiki/currents.md'],
  });
  expect((await mesa('vault', 'read', 'raw/chart.png')).stdout).toContain(
    'preview not available: Mesa does not preview images, audio, video, or PDFs\n',
  );

  expect(await mesa('vault', 'read', '.obsidian/app.json')).toMatchObject({
    code: 2,
    stderr: 'vault path .obsidian/app.json is a vault internal\n',
  });
  expect((await mesa('vault', 'read', 'wiki/missing.md')).code).toBe(3);
  expect((await mesa('vault', 'read')).code).toBe(2);
});

test('vault open opens the exact item, a canvas or a file with no extension', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(cli.home, 'obsidian'), { recursive: true });
  writeFileSync(
    join(cli.home, 'obsidian/obsidian.json'),
    JSON.stringify({ vaults: { a1: { path: join(cli.home, 'vault'), ts: 1 } } }),
  );
  mkdirSync(join(cli.home, 'vault/raw/tide'), { recursive: true });
  writeFileSync(join(cli.home, 'vault/raw/tide/map.canvas'), '{}');
  writeFileSync(join(cli.home, 'vault/raw/tide/LICENSE'), 'invented');
  for (const path of ['raw/tide/map.canvas', 'raw/tide/LICENSE']) {
    const opened = await mesa('vault', 'open', path, '--json');
    expect(opened.json.data.target).toBe(
      `obsidian://open?vault=vault&file=${encodeURIComponent(path)}`,
    );
  }
});

test('vault save decision, summary, and note print {path, changed, receipt}; a repeat adds no receipt', async () => {
  cli.withTmux();
  await cli.withProject();
  const session = (await mesa('open', 'lantern-cove', '--json')).json.data.id;
  const count = async () => (await mesa('receipts', '--json', '--limit', '50')).json.data.length;
  writeFileSync(join(cli.home, 'summary.md'), 'Goal: fix the tide flake\nDone: fixed clock\n');
  const saves = [
    [
      'decision',
      '--project',
      'lantern-cove',
      '--title',
      'Fixed clock in tide tests',
      '--decision',
      'Tests take the clock as a parameter',
      '--rationale',
      'The flake was the wall clock at midnight',
      '--probability',
      'fixed-clock=0.8',
      '--probability',
      'retry=0.2',
      '--confidence',
      '0.8',
    ],
    ['summary', '--session', session, '--file', 'summary.md'],
    ['note', '--project', 'lantern-cove', '--title', 'Tide table sources', '--text', 'The office.'],
  ];
  const paths = [
    'wiki/decisions/2026-09-24-fixed-clock-in-tide-tests.md',
    `wiki/sessions/${session}.md`,
    'wiki/notes/tide-table-sources.md',
  ];
  for (const [i, save] of saves.entries()) {
    const before = await count();
    const first = await mesa('vault', 'save', ...save, '--json');
    expect(first.json.data).toEqual({
      path: paths[i],
      changed: true,
      receipt: { id: expect.any(String), path: expect.stringMatching(/^receipts\//) },
    });
    expect(await count()).toBe(before + 1);
    const again = await mesa('vault', 'save', ...save, '--json');
    expect(again.json.data).toEqual({ path: paths[i], changed: false, receipt: null });
    expect(await count()).toBe(before + 1);
  }
  const decision = readFileSync(join(cli.home, 'vault', paths[0] ?? ''), 'utf8');
  expect(decision).toContain('probabilities:\n  fixed-clock: 0.8\n  retry: 0.2\nconfidence: 0.8\n');
  const kinds = await mesa('receipts', '--project', 'lantern-cove', '--json');
  expect(kinds.json.data.map((e: { receipt: { kind: string } }) => e.receipt.kind)).toEqual([
    'vault-change',
    'vault-change',
    'decision',
  ]);
  // The receipt keeps a short command line, not the note's whole text.
  expect(
    (await mesa('vault', 'save', 'note', '--title', 'T', '--text', 'x'.repeat(300))).stdout,
  ).toBe('saved wiki/notes/t.md\n');
  const [latest] = (await mesa('receipts', '--limit', '1', '--json')).json.data;
  expect(latest.receipt.command.length).toBeLessThan(160);
});

test('vault save refuses bad flags, both text and file, other folders, and locked notes', async () => {
  await cli.withProject();
  const save = (...words: string[]) => mesa('vault', 'save', ...words);
  const decision = ['decision', '--project', 'lantern-cove', '--title', 't', '--decision', 'd'];
  expect((await save(...decision, '--rationale', 'r', '--probability', 'ship')).stderr).toBe(
    '--probability takes <option>=<p>, not ship\n',
  );
  expect((await save(...decision, '--rationale', 'r', '--probability', 'a=x')).code).toBe(2);
  expect(
    (await save(...decision, '--rationale', 'r', '--probability', 'a=1', '--probability', 'a=0'))
      .stderr,
  ).toBe('--probability names a twice\n');
  expect((await save(...decision, '--rationale', 'r', '--confidence', 'high')).code).toBe(2);
  expect((await save(...decision, '--rationale', 'r', '--confidence', '2')).code).toBe(2);
  expect((await save(...decision)).code).toBe(2); // --rationale is required
  writeFileSync(join(cli.home, 'note.md'), 'From a file.\n');
  expect((await save('note', '--title', 't', '--text', 'x', '--file', 'note.md')).code).toBe(2);
  expect((await save('note', '--title', 't')).code).toBe(2);
  expect((await save('note', '--title', 't', '--file', 'nope.md')).code).toBe(3);
  expect((await save('note', '--title', 't', '--text', 'x', '--path', 'raw/t.md')).stderr).toBe(
    'a note goes under wiki/ or projects/<project>/, not raw/t.md\n',
  );
  const vault = join(cli.home, 'vault');
  mkdirSync(join(vault, 'wiki/notes'), { recursive: true });
  writeFileSync(join(vault, 'wiki/notes/t.md'), '---\nsource: mesa\nlocked: true\n---\nMine\n');
  const locked = await save('note', '--title', 't', '--file', 'note.md', '--json');
  expect(locked.code).toBe(8);
  expect(locked.json.error).toMatchObject({ code: 'locked', details: { reason: 'note' } });
  expect((await mesa('receipts', '--json')).json.data).toEqual([]);
});

test('a title with a newline saved twice logs one line', async () => {
  await cli.withProject();
  const save = () =>
    mesa('vault', 'save', 'note', '--title', 'Tide\nTables', '--text', 'x', '--json');
  const saved = (await save()).json.data;
  expect(saved.path).toBe('wiki/notes/tide-tables.md');
  expect((await save()).json.data.changed).toBe(false);
  const log = readFileSync(join(cli.home, 'vault/log.md'), 'utf8');
  const link = saved.receipt.path.replace(/\.md$/, '');
  expect(log.split('\n').filter((line) => line.includes(link))).toEqual([
    `- 2026-09-24T12:00:00.000Z Saved note Tide Tables in wiki/notes/tide-tables [[${link}|receipt]]`,
  ]);
});

test('vault search: {total, truncated, items} with snippets, filtered by --project, --type, and --limit', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  const vault = join(cli.home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(join(vault, path, '..'), { recursive: true });
    writeFileSync(join(vault, path), text);
  };
  put(
    'wiki/currents.md',
    '---\nproject: tide\n---\n# Currents\n\nThe foghorn sounds at the ebb.\n',
  );
  put('projects/tide/map.canvas', '{"nodes":[{"id":"a","type":"text","text":"Foghorn drill"}]}');
  put('raw/foghorn.png', 'png');
  put('.obsidian/foghorn.json', '{}');

  const found = await mesa('vault', 'search', 'FOGHORN', '--json');
  expect(found.code).toBe(0);
  expect(found.json.data.total).toBe(3);
  expect(found.json.data.truncated).toBe(false);
  expect(found.json.data.items[0]).toEqual({
    path: 'raw/foghorn.png',
    kind: 'attachment',
    title: 'foghorn.png',
    matches: [],
  });
  expect(found.json.data.items.map((i: { path: string }) => i.path).sort()).toEqual([
    'projects/tide/map.canvas',
    'raw/foghorn.png',
    'wiki/currents.md',
  ]);
  const tide = await mesa('vault', 'search', 'foghorn', '--project', 'tide', '--json');
  expect(tide.json.data.items.map((i: { path: string }) => i.path).sort()).toEqual([
    'projects/tide/map.canvas',
    'wiki/currents.md',
  ]);
  expect((await mesa('vault', 'search', 'foghorn', 'ebb', '--type', 'wiki')).stdout).toBe(
    'wiki/currents.md (markdown)\n  6: The foghorn sounds at the ebb.\n1 item\n',
  );
  const one = await mesa('vault', 'search', 'foghorn', '--limit', '1', '--json');
  expect([one.json.data.total, one.json.data.truncated, one.json.data.items.length]).toEqual([
    3,
    true,
    1,
  ]);
  expect((await mesa('vault', 'search', 'foghorn', '--limit', '1')).stdout).toMatch(
    /\n1 of 3 items\n$/,
  );
  expect((await mesa('vault', 'search', 'nothing-here')).stdout).toBe('0 items\n');
  expect(await mesa('vault', 'search', 'foghorn', '--limit', 'all')).toMatchObject({ code: 2 });
  expect(await mesa('vault', 'search', 'foghorn', '--type', 'notes')).toMatchObject({ code: 2 });
  expect(await mesa('vault', 'search')).toMatchObject({ code: 2 });
});

test('vault context and vault goals: a project overview and its earlier goals, as JSON and text', async () => {
  await mesa('init', '--vault', 'vault');
  await mesa('vault', 'init');
  mkdirSync(join(cli.home, 'tide'));
  await mesa('register', 'tide', '--create');
  const vault = join(cli.home, 'vault');
  const put = (path: string, text: string) => {
    mkdirSync(join(vault, path, '..'), { recursive: true });
    writeFileSync(join(vault, path), text);
  };

  // Nothing yet: empty lists and the hint.
  const empty = await mesa('vault', 'context', 'tide', '--json');
  expect(empty.json.data).toEqual({
    project: 'tide',
    hub: null,
    index: [],
    notes: [],
    decisions: [],
    goals: [],
    more: 'Nothing in the vault for tide yet: no hub at projects/tide.md, no notes, and no earlier sessions.',
  });

  put('projects/tide.md', '# Tide\n\n## Purpose\n\nTide tables.\n');
  put('wiki/currents.md', '---\nproject: tide\n---\n# Currents\n');
  put(
    'wiki/decisions/2026-09-20-fixed-clock.md',
    '---\nproject: tide\ntype: decision\n---\n# Fixed clock\n',
  );
  put('index.md', '# Index\n\n- [[wiki/currents]]: how the currents run\n');
  const store = testStore(cli.home, 'default', shortIds('aaaaaaaa', 'bbbbbbbb'));
  store.create(() =>
    newSession({
      project: 'tide',
      goal: 'Chart the neaps\nthen the springs',
      endedAt: '2026-09-24T13:00:00.000Z',
    }),
  );
  store.create(() => newSession({ project: 'tide', startedAt: '2026-09-25T12:00:00.000Z' }));
  put('wiki/sessions/aaaaaaaa.md', '# Summary\n');

  const context = await mesa('vault', 'context', 'tide', '--json');
  expect(context.code).toBe(0);
  expect(context.json.data).toMatchObject({
    project: 'tide',
    hub: { path: 'projects/tide.md', headings: ['# Tide', '## Purpose'] },
    index: ['- [[wiki/currents]]: how the currents run'],
    decisions: [
      {
        title: 'Fixed clock',
        path: 'wiki/decisions/2026-09-20-fixed-clock.md',
        when: '2026-09-20',
      },
    ],
    goals: [
      { id: 'bbbbbbbb', agent: 'claude' },
      { id: 'aaaaaaaa', summary: 'wiki/sessions/aaaaaaaa.md' },
    ],
  });
  // A summary names no project in its frontmatter here, so it is no note of tide's.
  expect(context.json.data.notes.map((n: { path: string }) => n.path)).toEqual([
    'wiki/currents.md',
  ]);
  const modified = context.json.data.notes[0].modified;
  expect((await mesa('vault', 'context', 'tide')).stdout).toBe(
    [
      'tide',
      'hub: projects/tide.md',
      '',
      '# Tide\n\n## Purpose\n\nTide tables.',
      '',
      'index:',
      '  - [[wiki/currents]]: how the currents run',
      'notes:',
      `  ${modified}  wiki/currents.md  Currents`,
      'decisions:',
      '  2026-09-20  wiki/decisions/2026-09-20-fixed-clock.md  Fixed clock',
      'goals:',
      '  bbbbbbbb  claude  2026-09-25T12:00:00.000Z  -',
      '  aaaaaaaa  claude  2026-09-24T12:00:00.000Z  Chart the neaps  wiki/sessions/aaaaaaaa.md',
      'Nothing left out. mesa vault read <path> reads a note in full, mesa vault list --project tide lists every item, and mesa vault goals tide lists earlier goals.',
      '',
    ].join('\n'),
  );

  const goals = await mesa('vault', 'goals', 'tide', '--limit', '1', '--json');
  expect(goals.json.data).toEqual([
    { id: 'bbbbbbbb', agent: 'claude', started: '2026-09-25T12:00:00.000Z' },
  ]);
  // Inside a session's window, that session is no earlier one.
  cli.env = { MESA_SESSION_ID: 'bbbbbbbb', MESA_PROFILE: 'default' };
  expect((await mesa('vault', 'goals', 'tide')).stdout).toBe(
    'aaaaaaaa  claude  2026-09-24T12:00:00.000Z  Chart the neaps  wiki/sessions/aaaaaaaa.md\n',
  );
  cli.env = {};

  const general = await mesa('vault', 'context', '--general', '--json');
  expect(general.json.data).toMatchObject({
    project: '__mesa_general__',
    hub: null,
    counts: { projects: 1, wiki: 3, index: 1 },
    goals: [],
  });
  expect((await mesa('vault', 'goals', '--general')).stdout).toBe('no earlier sessions\n');

  expect(await mesa('vault', 'context', 'nowhere')).toMatchObject({
    code: 3,
    stderr: 'no project named nowhere; see mesa projects\n',
  });
  for (const argv of [
    ['vault', 'context'],
    ['vault', 'goals', 'tide', '--general'],
  ]) {
    expect(await mesa(...argv)).toMatchObject({
      code: 2,
      stderr: 'pass a project or --general, not both\n',
    });
  }
  expect((await mesa('vault', 'goals', 'tide', '--limit', 'none')).code).toBe(2);
});
