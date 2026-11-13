import { expect, test } from 'vitest';
import { noteBlocks, plainText, spansOf } from './noteBlocks';

const links = [
  { text: '[[tide-tables|the tables]]', path: 'wiki/notes/tide-tables.md' },
  { text: '[[wiki/notes/neap#Spring]]', path: 'wiki/notes/neap.md' },
  { text: '[chart](../raw/chart.png)', path: 'raw/chart.png' },
];
const paths = new Map(links.map((l) => [l.text, l.path]));

test('a wikilink shows its alias, else its file name and heading, and opens the item it resolved to', () => {
  expect(spansOf('See [[tide-tables|the tables]] and [[wiki/notes/neap#Spring]].', paths)).toEqual([
    { text: 'See ' },
    { text: 'the tables', path: 'wiki/notes/tide-tables.md' },
    { text: ' and ' },
    { text: 'neap > Spring', path: 'wiki/notes/neap.md' },
    { text: '.' },
  ]);
});

test('a link to nothing is broken, a URL opens outside, and emphasis and code spans keep their words', () => {
  expect(
    spansOf(
      '[[gone]] [chart](../raw/chart.png) [site](https://a.test) **bold** *it* `x*y*`',
      paths,
    ),
  ).toEqual([
    { text: 'gone', broken: true },
    { text: ' ' },
    { text: 'chart', path: 'raw/chart.png' },
    { text: ' ' },
    { text: 'site', url: 'https://a.test' },
    { text: ' ' },
    { text: 'bold', bold: true },
    { text: ' ' },
    { text: 'it', italic: true },
    { text: ' ' },
    { text: 'x*y*', code: true },
  ]);
});

test('a note reads as headings, paragraphs joined, lists and tasks, quotes, code, tables and rules', () => {
  const body = [
    '# Tides',
    '',
    'Two lines',
    'make one paragraph.',
    '- first',
    '  wraps on',
    '  - nested',
    '1. counted',
    '- [ ] open task',
    '- [x] done task',
    '> quoted',
    '> on',
    '```ts',
    'const a = 1;',
    '```',
    '| a | b |',
    '|---|---|',
    '---',
    'end',
  ].join('\n');
  expect(noteBlocks(body, links)).toEqual([
    { kind: 'heading', level: 1, spans: [{ text: 'Tides' }] },
    { kind: 'paragraph', spans: [{ text: 'Two lines make one paragraph.' }] },
    { kind: 'item', depth: 0, marker: '•', spans: [{ text: 'first wraps on' }] },
    { kind: 'item', depth: 1, marker: '•', spans: [{ text: 'nested' }] },
    { kind: 'item', depth: 0, marker: '1.', spans: [{ text: 'counted' }] },
    { kind: 'item', depth: 0, marker: '☐', spans: [{ text: 'open task' }] },
    { kind: 'item', depth: 0, marker: '☑', spans: [{ text: 'done task' }] },
    { kind: 'quote', spans: [{ text: 'quoted on' }] },
    { kind: 'code', text: 'const a = 1;' },
    { kind: 'code', text: '| a | b |\n|---|---|' },
    { kind: 'rule' },
    { kind: 'paragraph', spans: [{ text: 'end' }] },
  ]);
});

test('an unclosed fence keeps its code to the end', () => {
  expect(noteBlocks('```\nopen', [])).toEqual([{ kind: 'code', text: 'open' }]);
});

test("an HTML comment is hidden, and a summary reads without its links' markup", () => {
  expect(noteBlocks('<!-- mesa:daily:start -->\n## Log\n<!-- mesa:daily:end -->', [])).toEqual([
    { kind: 'heading', level: 2, spans: [{ text: 'Log' }] },
  ]);
  expect(plainText('Saved decision Tides in [[wiki/decisions/tides|tides]] **now**')).toBe(
    'Saved decision Tides in tides now',
  );
});
