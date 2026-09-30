import { expect, test } from 'vitest';
import { linkIndex, resolveLinks, type VaultLink } from './links.js';

// An invented vault's paths, as the inventory lists them.
const index = linkIndex([
  'AGENTS.md',
  'Garden/kale.md',
  'Garden/Seeds/kale.md',
  'index.md',
  'projects/tide.md',
  'projects/tide/map.canvas',
  'raw/chart.png',
  'raw/tide tables.pdf',
  'wiki/harbour-lights.md',
  'wiki/sessions/01K62V4Q8J3M5N7P9R1S2T3V4W.md',
]);
const from = 'wiki/notes/ferry.md';
/** Each link of `body`, from the note at `from`, without its offsets. */
const links = (body: string, at = from) =>
  resolveLinks(index, at, body).map(({ start, end, ...link }) => link);
const where = (link: VaultLink | undefined) =>
  link?.status === 'resolved' ? link.path : link?.status;

test('a wikilink resolves by file name anywhere, with an alias, a heading, or a block', () => {
  expect(
    links('See [[harbour-lights|the lights]] and [[Tide#Tables#Neap]] or [[tide#^a1b2]].'),
  ).toEqual([
    {
      text: '[[harbour-lights|the lights]]',
      syntax: 'wikilink',
      embed: false,
      target: 'harbour-lights',
      alias: 'the lights',
      status: 'resolved',
      path: 'wiki/harbour-lights.md',
    },
    {
      text: '[[Tide#Tables#Neap]]',
      syntax: 'wikilink',
      embed: false,
      target: 'Tide',
      subpath: 'Tables#Neap',
      status: 'resolved',
      path: 'projects/tide.md',
    },
    {
      text: '[[tide#^a1b2]]',
      syntax: 'wikilink',
      embed: false,
      target: 'tide',
      subpath: '^a1b2',
      status: 'resolved',
      path: 'projects/tide.md',
    },
  ]);
});

test('an embed names its attachment with the extension; a canvas needs its extension too', () => {
  expect(links('![[chart.png|300]] ![[map.canvas]] [[map]] ![[chart]]')).toEqual([
    expect.objectContaining({
      embed: true,
      target: 'chart.png',
      status: 'resolved',
      path: 'raw/chart.png',
    }),
    expect.objectContaining({
      embed: true,
      target: 'map.canvas',
      path: 'projects/tide/map.canvas',
    }),
    expect.objectContaining({ embed: false, target: 'map', status: 'broken' }),
    expect.objectContaining({ embed: true, target: 'chart', status: 'broken' }),
  ]);
});

test('a path-qualified link matches by path suffix; the exact vault path wins over a name', () => {
  const found = resolveLinks(
    index,
    from,
    '[[Seeds/kale]] [[garden/kale]] [[Garden/Seeds/kale.md]] [[index]] [[/projects/tide]]',
  );
  expect(found.map(where)).toEqual([
    'Garden/Seeds/kale.md',
    'Garden/kale.md',
    'Garden/Seeds/kale.md',
    'index.md',
    'projects/tide.md',
  ]);
});

test('two notes with the same name are ambiguous, both listed; a missing one is broken', () => {
  expect(links('[[kale]] and [[Kale.md|greens]] but not [[turnips]]')).toEqual([
    {
      text: '[[kale]]',
      syntax: 'wikilink',
      embed: false,
      target: 'kale',
      status: 'ambiguous',
      candidates: ['Garden/Seeds/kale.md', 'Garden/kale.md'],
    },
    expect.objectContaining({ alias: 'greens', status: 'ambiguous' }),
    {
      text: '[[turnips]]',
      syntax: 'wikilink',
      embed: false,
      target: 'turnips',
      status: 'broken',
    },
  ]);
});

test('a Markdown link is relative to the note first, decoded, and a URL is no link', () => {
  const body = [
    '[the chart](../../raw/chart.png)',
    '![tables](<../../raw/tide tables.pdf>)',
    '[tables](../../raw/tide%20tables.pdf "Tide tables")',
    '[lights](../harbour-lights.md#Keepers)',
    '[tide](projects/tide.md)', // not beside the note: the vault path
    '[web](https://example.com/tide.md) [mail](mailto:ada@example.com) [app](obsidian://open)',
    '[gone](../../../outside.md) [none](./nowhere.md)',
  ].join('\n');
  expect(links(body)).toEqual([
    expect.objectContaining({ syntax: 'markdown', alias: 'the chart', path: 'raw/chart.png' }),
    expect.objectContaining({
      embed: true,
      target: '../../raw/tide tables.pdf',
      path: 'raw/tide tables.pdf',
    }),
    expect.objectContaining({ target: '../../raw/tide tables.pdf', path: 'raw/tide tables.pdf' }),
    expect.objectContaining({ subpath: 'Keepers', path: 'wiki/harbour-lights.md' }),
    expect.objectContaining({ target: 'projects/tide.md', path: 'projects/tide.md' }),
    expect.objectContaining({ target: '../../../outside.md', status: 'broken' }),
    expect.objectContaining({ target: './nowhere.md', status: 'broken' }),
  ]);
});

test('links in fenced and inline code are not links; a heading-only link is the note itself', () => {
  const body = [
    'Before [[index]] and `[[tide]]` and ``a `[[kale]]` b``.',
    '```md',
    '[[harbour-lights]] [x](../harbour-lights.md)',
    '```',
    '~~~~',
    '```',
    '[[AGENTS]]',
    '~~~~',
    'After [[#Tables]] | [[tide\\|tides]]',
  ].join('\n');
  const found = resolveLinks(index, from, body);
  expect(found.map((link) => [link.text, where(link)])).toEqual([
    ['[[index]]', 'index.md'],
    ['[[#Tables]]', from],
    ['[[tide\\|tides]]', 'projects/tide.md'],
  ]);
  // Offsets are the body's, so the reader can replace each link where it is written.
  for (const link of found) expect(body.slice(link.start, link.end)).toBe(link.text);
  expect(found[2]).toMatchObject({ target: 'tide', alias: 'tides' });
});

test('indented code blocks contain no links, while a paragraph continuation may be indented', () => {
  const body = '    [[tide]]\n\t[[index]]\n\nAfter [[index]].\n    Continued [[tide]].\n';
  expect(links(body).map((link) => link.text)).toEqual(['[[index]]', '[[tide]]']);
});

test('list paragraph indentation is kept, and additional indentation is code', () => {
  const body = '- First\n\n    [[tide]]\n\n      [[AGENTS]]\n\n- Second\n\n    [[index]]\n';
  expect(links(body).map((link) => link.text)).toEqual(['[[tide]]', '[[index]]']);
});

test('thematic breaks and setext headings end paragraphs before an indented code block', () => {
  for (const boundary of ['---', '* * *', '___', 'Title\n===', 'Title\n-']) {
    expect(links(`${boundary}\n    [[tide]]\n`)).toEqual([]);
  }
});
