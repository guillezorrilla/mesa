import { mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { fixedClock, tempDir, thrown } from '../testing/index.js';
import { searchVault } from './search.js';
import { initVault } from './vault.js';

let vault: string;
let outside: string;
/** Writes an invented file into the vault, its folders too, last changed on `day` of 2026-09. */
const put = (path: string, text: string, day = 1) => {
  mkdirSync(dirname(join(vault, path)), { recursive: true });
  writeFileSync(join(vault, path), text);
  const at = new Date(Date.UTC(2026, 8, day));
  utimesSync(join(vault, path), at, at);
};
const paths = (text: string, filter = {}) =>
  searchVault(vault, text, filter).items.map((hit) => hit.path);

beforeEach(() => {
  vault = join(tempDir(), 'vault');
  initVault({ path: vault, clock: fixedClock() });
  outside = tempDir();
  writeFileSync(join(outside, 'lighthouse.md'), 'The lighthouse keeper, marooned.\n');
  put(
    'wiki/harbour-lights.md',
    '---\nproject: tide\nkeeper: Ada Quill\n---\n# Harbour lights\n\nThe lighthouse turns at dusk.\nNothing here.\nDusk again, lighthouse again.\n',
    3,
  );
  put('projects/tide.md', '# Tide\n\nSee [[harbour-lights]].\n', 2);
  put(
    'projects/tide/map.canvas',
    JSON.stringify({
      nodes: [
        { id: 'a', type: 'text', text: 'Neap tides', x: 0, y: 0, width: 1, height: 1 },
        { id: 'b', type: 'text', text: 'Spring tides\nand the lighthouse', x: 0, y: 0 },
      ],
      edges: [],
    }),
    4,
  );
  put('Garden/beds.base', 'views:\n  - type: table\n    name: Kale beds\n', 5);
  put('raw/lighthouse.png', 'png'); // the oldest
  put('.obsidian/workspace.json', '{"lighthouse": true}');
  put('wiki/.trash/lighthouse.md', 'A trashed lighthouse.\n');
  symlinkSync(join(outside, 'lighthouse.md'), join(vault, 'wiki/elsewhere.md'));
});

test('a body word finds the note, with numbered snippets, title and project', () => {
  const found = searchVault(vault, 'DUSK');
  expect(found).toEqual({
    total: 1,
    truncated: false,
    items: [
      {
        path: 'wiki/harbour-lights.md',
        kind: 'markdown',
        project: 'tide',
        title: 'harbour-lights',
        matches: [
          { line: 7, text: 'The lighthouse turns at dusk.' },
          { line: 9, text: 'Dusk again, lighthouse again.' },
        ],
      },
    ],
  });
});

test('a frontmatter value, a canvas text node, a base, and a file name each find their item', () => {
  expect(searchVault(vault, 'quill').items).toEqual([
    expect.objectContaining({
      path: 'wiki/harbour-lights.md',
      matches: [{ line: 3, text: 'keeper: Ada Quill' }],
    }),
  ]);
  // A frontmatter key is not a value: `keeper` alone matches nothing.
  expect(paths('keeper')).toEqual([]);
  expect(searchVault(vault, 'spring').items).toEqual([
    {
      path: 'projects/tide/map.canvas',
      kind: 'canvas',
      project: 'tide',
      title: 'map.canvas',
      matches: [{ line: 2, text: 'Spring tides' }],
    },
  ]);
  expect(searchVault(vault, 'kale beds').items).toEqual([
    expect.objectContaining({
      path: 'Garden/beds.base',
      kind: 'base',
      matches: [{ line: 3, text: 'name: Kale beds' }],
    }),
  ]);
  // An attachment is matched by its path alone, so it has no snippet.
  expect(searchVault(vault, 'png').items).toEqual([
    {
      path: 'raw/lighthouse.png',
      kind: 'attachment',
      title: 'lighthouse.png',
      matches: [],
    },
  ]);
});

test('every word must match; path matches come first, then the newest', () => {
  expect(paths('lighthouse')).toEqual([
    'raw/lighthouse.png', // its path names it, though it is the oldest
    'projects/tide/map.canvas', // newer than the note
    'wiki/harbour-lights.md',
  ]);
  expect(paths('lighthouse keeper')).toEqual([]); // `keeper` is only a frontmatter key
  expect(paths('lighthouse ada')).toEqual(['wiki/harbour-lights.md']);
  expect(paths('harbour')).toEqual(['wiki/harbour-lights.md', 'projects/tide.md']);
});

test('internals, trashed notes, and a link out of the vault never appear', () => {
  const all = paths('lighthouse');
  expect(all).not.toContain('.obsidian/workspace.json');
  expect(all).not.toContain('wiki/.trash/lighthouse.md');
  expect(all).not.toContain('wiki/elsewhere.md');
  expect(paths('marooned')).toEqual([]); // only the linked note outside says it
  expect(paths('elsewhere')).toEqual([]);
});

test('--project and --type use the inventory rule; limit caps items and reports the total', () => {
  expect(paths('lighthouse', { project: 'tide' })).toEqual([
    'projects/tide/map.canvas',
    'wiki/harbour-lights.md',
  ]);
  expect(paths('lighthouse', { type: 'markdown' })).toEqual(['wiki/harbour-lights.md']);
  expect(paths('lighthouse', { type: 'raw' })).toEqual(['raw/lighthouse.png']);
  const one = searchVault(vault, 'lighthouse', { limit: 1 });
  expect([one.total, one.truncated, one.items.length]).toEqual([3, true, 1]);
  expect(thrown(() => searchVault(vault, 'lighthouse', { limit: 0 }))).toMatchObject({
    code: 'usage',
  });
  expect(thrown(() => searchVault(vault, '  '))).toMatchObject({ code: 'usage' });
  expect(thrown(() => searchVault(vault, 'x', { type: 'notes' }))).toMatchObject({
    code: 'usage',
  });
});

test('at most 3 snippets, each at most 200 characters around the word', () => {
  const long = `${'Ebb and flow. '.repeat(30)}The buoy bell rings. ${'Slack water. '.repeat(20)}`;
  put('wiki/buoys.md', `${long}\nbuoy\nbuoy\nbuoy\nbuoy\n`);
  const [hit] = searchVault(vault, 'buoy').items;
  expect(hit?.matches.map((match) => match.line)).toEqual([1, 2, 3]);
  const first = hit?.matches[0]?.text ?? '';
  expect(first.length).toBeLessThanOrEqual(200);
  expect(first).toMatch(/^\.\.\..*The buoy bell rings\..*\.\.\.$/);
});

test('snippets keep the match after expanding lowercase letters and never split an emoji', () => {
  put('wiki/unicode.md', `${'İ'.repeat(100)}needle${'x'.repeat(300)}`);
  const shifted = searchVault(vault, 'needle').items[0]?.matches[0]?.text ?? '';
  expect(shifted).toContain('needle');
  put('wiki/unicode.md', `${'x'.repeat(41)}😀${'x'.repeat(39)}needle${'x'.repeat(300)}`);
  const emoji = searchVault(vault, 'needle').items[0]?.matches[0]?.text ?? '';
  expect(emoji).toContain('needle');
  expect(emoji).toContain('😀');
  expect(emoji).not.toMatch(/[\uD800-\uDFFF]/u);
  expect(Array.from(emoji).length).toBeLessThanOrEqual(200);
});
