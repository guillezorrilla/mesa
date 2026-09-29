import { chmodSync, mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { fixedClock, tempDir, thrown } from '../testing/index.js';
import { listVault } from './inventory.js';
import { initVault } from './vault.js';

let vault: string;
let outside: string;
/** Writes an invented file into the vault, its folders too. */
const put = (path: string, text = `# ${path}\n`) => {
  mkdirSync(dirname(join(vault, path)), { recursive: true });
  writeFileSync(join(vault, path), text);
};
const paths = (items: { path: string }[]) => items.map((i) => i.path);

beforeEach(() => {
  vault = join(tempDir(), 'vault');
  initVault({ path: vault, clock: fixedClock() });
  outside = tempDir();
  writeFileSync(join(outside, 'harbour.md'), '---\nproject: elsewhere\n---\nNot the vault.\n');
});

test('listVault lists every file but the internals exactly once, with no cap', () => {
  const receipts = Array.from({ length: 60 }, (_, i) => {
    const n = String(i).padStart(2, '0');
    const path = `receipts/2026/09/20260924T12${n}00Z-decision-01K62V4Q8J3M5N7P9R1S2T30${n}.md`;
    put(path, `---\nkind: decision\nproject: ${i % 2 ? 'tide' : 'lantern-cove'}\n---\nChose.\n`);
    return path;
  });
  const knowledge = [
    'raw/interview.md',
    'raw/tide-tables.pdf',
    'wiki/harbour-lights.md', // in no index
    'wiki/sessions/01K62V4Q8J3M5N7P9R1S2T3V4W.md',
    'projects/lantern-cove.md',
    'projects/lantern-cove/decisions.md',
    'projects/lantern-cove/map.canvas',
    'daily/2026-09-24.md',
    'Garden/Seeds/Winter/kale.md', // nested user folders
    'Garden/beds.base',
    'Garden/photo.JPG',
    'Garden/notes.txt',
    'loose-thoughts.md', // outside projects, at the top
  ];
  for (const path of knowledge) put(path);
  // A session summary names its project in its frontmatter.
  put('wiki/sessions/01K62V4Q8J3M5N7P9R1S2T3V4W.md', '---\nproject: lantern-cove\n---\nSummary.\n');
  for (const internal of [
    '.obsidian/app.json',
    '.obsidian/plugins/calendar/main.js',
    '.mesa/lock',
    '.trash/old.md',
    '.git/HEAD',
    '.DS_Store',
    'wiki/.DS_Store',
  ])
    put(internal);
  symlinkSync(join(outside, 'harbour.md'), join(vault, 'wiki/harbour.md'));
  symlinkSync(outside, join(vault, 'projects/elsewhere'));

  const items = listVault(vault);
  const expected = [
    'AGENTS.md',
    'index.md',
    'log.md',
    ...knowledge,
    ...receipts,
    'wiki/harbour.md',
    'projects/elsewhere',
  ].sort();
  expect(paths(items)).toEqual(expected);
  expect(new Set(paths(items)).size).toBe(items.length);

  const byPath = Object.fromEntries(items.map((i) => [i.path, i]));
  const shape = (path: string) => {
    const { size, modified, ...rest } = byPath[path] ?? {};
    return rest;
  };
  expect(shape('index.md')).toEqual({ path: 'index.md', kind: 'markdown', category: 'index' });
  expect(shape('log.md')).toMatchObject({ category: 'log' });
  expect(shape('AGENTS.md')).toMatchObject({ category: 'agents' });
  expect(shape('raw/tide-tables.pdf')).toMatchObject({ kind: 'attachment', category: 'raw' });
  expect(shape('Garden/photo.JPG')).toMatchObject({ kind: 'attachment', category: 'user' });
  expect(shape('Garden/beds.base')).toMatchObject({ kind: 'base', category: 'user' });
  expect(shape('Garden/notes.txt')).toMatchObject({ kind: 'other', category: 'user' });
  expect(shape('loose-thoughts.md')).toEqual({
    path: 'loose-thoughts.md',
    kind: 'markdown',
    category: 'user',
  });
  expect(shape('projects/lantern-cove.md')).toMatchObject({ project: 'lantern-cove' });
  expect(shape('projects/lantern-cove/map.canvas')).toEqual({
    path: 'projects/lantern-cove/map.canvas',
    kind: 'canvas',
    category: 'projects',
    project: 'lantern-cove',
  });
  expect(shape('wiki/sessions/01K62V4Q8J3M5N7P9R1S2T3V4W.md')).toMatchObject({
    category: 'wiki',
    project: 'lantern-cove',
  });
  expect(shape('daily/2026-09-24.md')).toEqual({
    path: 'daily/2026-09-24.md',
    kind: 'markdown',
    category: 'daily',
  });
  // The links out are listed, never read: the outside note's project never shows.
  expect(shape('wiki/harbour.md')).toEqual({
    path: 'wiki/harbour.md',
    kind: 'markdown',
    category: 'wiki',
    unavailable: 'outside the vault',
  });
  expect(shape('projects/elsewhere')).toEqual({
    path: 'projects/elsewhere',
    kind: 'other',
    category: 'projects',
    unavailable: 'outside the vault',
  });

  expect(listVault(vault, { type: 'receipts' })).toHaveLength(60);
  expect(paths(listVault(vault, { type: 'attachment' }))).toEqual([
    'Garden/photo.JPG',
    'raw/tide-tables.pdf',
  ]);
  expect(listVault(vault, { project: 'tide' })).toHaveLength(30);
  const cove = listVault(vault, { project: 'lantern-cove' });
  expect(cove).toHaveLength(34); // the hub, its folder's two, the session summary, 30 receipts
  expect(paths(listVault(vault, { project: 'lantern-cove', type: 'canvas' }))).toEqual([
    'projects/lantern-cove/map.canvas',
  ]);
  expect(listVault(vault, { project: 'nowhere' })).toEqual([]);
});

test('an item has its size in bytes and its modified time', () => {
  put('wiki/tide.md', 'twelve bytes');
  utimesSync(
    join(vault, 'wiki/tide.md'),
    new Date('2026-09-20T08:00:00Z'),
    new Date('2026-09-20T08:00:00Z'),
  );
  expect(listVault(vault, { type: 'wiki' })).toEqual([
    {
      path: 'wiki/tide.md',
      kind: 'markdown',
      category: 'wiki',
      size: 12,
      modified: '2026-09-20T08:00:00.000Z',
    },
  ]);
});

test('links in the vault, broken links, and folders that do not open are each listed once', () => {
  put('projects/tide.md', '---\nstatus: active\n---\n# Tide\n');
  put('wiki/broken-yaml.md', '---\nproject: [unclosed\n---\nStill listed.\n');
  symlinkSync(join(vault, 'projects/tide.md'), join(vault, 'wiki/tide-alias.md'));
  symlinkSync(join(vault, 'projects'), join(vault, 'wiki/hubs'));
  symlinkSync(join(outside, 'gone.md'), join(vault, 'wiki/gone.md'));
  put('raw/locked/secret.md');
  chmodSync(join(vault, 'raw/locked'), 0o000);
  try {
    const items = Object.fromEntries(listVault(vault).map((i) => [i.path, i]));
    expect(Object.keys(items).sort()).toEqual(
      [
        'AGENTS.md',
        'index.md',
        'log.md',
        'projects/tide.md',
        'raw/locked',
        'wiki/broken-yaml.md',
        'wiki/gone.md',
        'wiki/hubs',
        'wiki/tide-alias.md',
      ].sort(),
    );
    expect(items['wiki/tide-alias.md']).toMatchObject({ kind: 'markdown' });
    expect(items['wiki/tide-alias.md']?.unavailable).toBeUndefined();
    expect(items['wiki/hubs']?.unavailable).toBe('a folder link');
    expect(items['wiki/gone.md']?.unavailable).toBe('a broken link');
    expect(items['raw/locked']?.unavailable).toBe('unreadable');
    expect(items['wiki/broken-yaml.md']?.unavailable).toBeUndefined();
  } finally {
    chmodSync(join(vault, 'raw/locked'), 0o755);
  }
});

test('a type is a kind or a category; a missing vault is not_found', () => {
  expect(thrown(() => listVault(vault, { type: 'notes' }))).toEqual({
    code: 'usage',
    message:
      "a vault item's type is a kind (markdown, canvas, base, attachment, other) or a category (raw, wiki, projects, receipts, daily, index, log, agents, user), not notes",
  });
  const missing = join(vault, 'nowhere');
  expect(thrown(() => listVault(missing))).toEqual({
    code: 'not_found',
    message: `vault ${missing} does not exist; run mesa vault init`,
  });
  expect(thrown(() => listVault(join(vault, 'log.md'))).code).toBe('invalid_config');
});
