import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { fixedClock, tempDir, thrown } from '../testing/index.js';
import { readVaultItem } from './reader.js';
import { initVault } from './vault.js';

let vault: string;
/** Writes an invented file into the vault, its folders too. */
const put = (path: string, text: string) => {
  mkdirSync(dirname(join(vault, path)), { recursive: true });
  writeFileSync(join(vault, path), text);
};
const uri = (path: string) => `obsidian://open?vault=vault&file=${encodeURIComponent(path)}`;

beforeEach(() => {
  vault = join(tempDir(), 'vault');
  initVault({ path: vault, clock: fixedClock() });
  put(
    'wiki/harbour-lights.md',
    '---\nproject: tide\ntags: [lights, keepers]\n---\n# Harbour lights\n\nAda keeps [[tide|the tide hub]], ![[chart.png]] and [[kale]]; not [[turnips]].\n',
  );
  put('projects/tide.md', '# Tide\n\nSee [[harbour-lights]] and [[#Tables]].\n');
  put('daily/2026-09-24.md', 'Read [the lights](../wiki/harbour-lights.md) today.\n');
  put('wiki/ferry.md', '```\n[[harbour-lights]]\n```\n[[kale]]\n');
  put('Garden/kale.md', 'Kale.\n');
  put('Garden/Seeds/kale.md', 'Kale seeds.\n');
  put('raw/chart.png', 'png');
  put('raw/tide.json', '{}');
  put(
    'projects/tide/map.canvas',
    JSON.stringify({
      nodes: [
        { id: 'a', type: 'text', text: 'Neap tides', x: 0, y: 0, width: 1, height: 1 },
        { id: 'b', type: 'file', file: 'projects/tide.md', x: 0, y: 0, width: 1, height: 1 },
        { id: 'c', type: 'text', text: 'Spring tides', x: 0, y: 0, width: 1, height: 1 },
      ],
      edges: [{ id: 'e', fromNode: 'a', toNode: 'c' }],
    }),
  );
  put('Garden/beds.base', 'views:\n  - type: table\n    name: Beds\n');
});

test('a note reads with its properties, body, resolved links, and backlinks', () => {
  const read = readVaultItem(vault, 'wiki/harbour-lights.md');
  expect(read).toMatchObject({
    path: 'wiki/harbour-lights.md',
    kind: 'markdown',
    category: 'wiki',
    project: 'tide',
    uri: uri('wiki/harbour-lights.md'),
    preview: 'markdown',
    frontmatter: { project: 'tide', tags: ['lights', 'keepers'] },
    body: expect.stringMatching(/^# Harbour lights\n/),
    // Linked from the hub and the daily note; not from code, and ferry.md links elsewhere.
    backlinks: ['daily/2026-09-24.md', 'projects/tide.md'],
  });
  if (read.preview !== 'markdown') throw new Error(read.preview);
  expect(
    read.links.map((link) => [
      link.text,
      link.status,
      'path' in link ? link.path : 'candidates' in link ? link.candidates : undefined,
    ]),
  ).toEqual([
    ['[[tide|the tide hub]]', 'resolved', 'projects/tide.md'],
    ['![[chart.png]]', 'resolved', 'raw/chart.png'],
    ['[[kale]]', 'ambiguous', ['Garden/Seeds/kale.md', 'Garden/kale.md']],
    ['[[turnips]]', 'broken', undefined],
  ]);
});

test('backlinks count resolved links only, never a note linking itself', () => {
  expect(readVaultItem(vault, 'projects/tide.md').backlinks).toEqual(['wiki/harbour-lights.md']);
  // [[kale]] is ambiguous, so neither kale is linked; an embed is a link to its attachment.
  expect(readVaultItem(vault, 'Garden/kale.md').backlinks).toEqual([]);
  expect(readVaultItem(vault, 'raw/chart.png').backlinks).toEqual(['wiki/harbour-lights.md']);
});

test('a canvas reads as its counts and text nodes, a base as its YAML', () => {
  expect(readVaultItem(vault, 'projects/tide/map.canvas')).toMatchObject({
    kind: 'canvas',
    project: 'tide',
    uri: uri('projects/tide/map.canvas'),
    preview: 'canvas',
    nodes: 3,
    edges: 1,
    texts: ['Neap tides', 'Spring tides'],
  });
  put('projects/tide/empty.canvas', '');
  expect(readVaultItem(vault, 'projects/tide/empty.canvas')).toMatchObject({
    preview: 'canvas',
    nodes: 0,
    edges: 0,
    texts: [],
  });
  put('projects/tide/broken.canvas', '{"nodes": [');
  expect(readVaultItem(vault, 'projects/tide/broken.canvas')).toMatchObject({
    preview: 'unsupported',
    reason: 'it is not a JSON Canvas file',
  });
  expect(readVaultItem(vault, 'Garden/beds.base')).toMatchObject({
    kind: 'base',
    uri: uri('Garden/beds.base'),
    preview: 'base',
    yaml: 'views:\n  - type: table\n    name: Beds\n',
  });
});

test('an attachment or other file has no preview and says why, with its exact URI', () => {
  expect(readVaultItem(vault, 'raw/chart.png')).toMatchObject({
    kind: 'attachment',
    uri: uri('raw/chart.png'),
    preview: 'unsupported',
    reason: 'Mesa does not preview images, audio, video, or PDFs',
  });
  expect(readVaultItem(vault, 'raw/tide.json')).toMatchObject({
    kind: 'other',
    uri: uri('raw/tide.json'),
    preview: 'unsupported',
    reason: 'Mesa previews only Markdown, canvases, and bases',
  });
  // A note the system does not let Mesa open is listed, and says so instead of failing.
  chmodSync(join(vault, 'wiki/ferry.md'), 0o000);
  try {
    expect(readVaultItem(vault, 'wiki/ferry.md')).toMatchObject({
      preview: 'unsupported',
      reason: 'the system does not let Mesa read it',
    });
  } finally {
    chmodSync(join(vault, 'wiki/ferry.md'), 0o644);
  }
});

test('a note with broken YAML reads as all body', () => {
  put('wiki/odd.md', '---\ntitle: [unclosed\n---\nBody.\n');
  expect(readVaultItem(vault, 'wiki/odd.md')).toMatchObject({
    frontmatter: {},
    body: '---\ntitle: [unclosed\n---\nBody.\n',
  });
});

test('paths out of scope, internals, and unlisted items are refused through the scope owner', () => {
  const outside = tempDir();
  writeFileSync(join(outside, 'secret.md'), 'Not the vault.\n');
  symlinkSync(join(outside, 'secret.md'), join(vault, 'wiki/secret.md'));
  put('.obsidian/app.json', '{}');
  expect(thrown(() => readVaultItem(vault, '../secret.md'))).toMatchObject({
    code: 'usage',
    message: 'vault path ../secret.md is outside the vault',
  });
  expect(thrown(() => readVaultItem(vault, '.obsidian/app.json'))).toMatchObject({
    code: 'usage',
    message: 'vault path .obsidian/app.json is a vault internal',
  });
  expect(thrown(() => readVaultItem(vault, 'wiki/secret.md'))).toMatchObject({
    code: 'usage',
    message: 'vault path wiki/secret.md is outside the vault',
  });
  expect(thrown(() => readVaultItem(vault, 'wiki/missing.md')).code).toBe('not_found');
  expect(thrown(() => readVaultItem(vault, 'wiki')).code).toBe('not_found');
  // A path written another way is the same item.
  expect(readVaultItem(vault, './wiki//harbour-lights.md').path).toBe('wiki/harbour-lights.md');
});
