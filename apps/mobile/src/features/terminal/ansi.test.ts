import { expect, test } from 'vitest';
import { ansiLines } from './ansi';

test('plain lines are one run each', () => {
  expect(ansiLines(['$ ls', 'README.md'])).toEqual([
    { text: '$ ls', spans: [{ text: '$ ls' }] },
    { text: 'README.md', spans: [{ text: 'README.md' }] },
  ]);
});

test('colours and styles split a line into runs, and a reset ends them', () => {
  const [line] = ansiLines(['\x1b[1;31merror\x1b[0m: \x1b[4;94mmissing\x1b[24m file\x1b[m']);
  expect(line?.text).toBe('error: missing file');
  expect(line?.spans).toEqual([
    { text: 'error', bold: true, fg: 1 },
    { text: ': ' },
    { text: 'missing', underline: true, fg: 12 },
    { text: ' file', underline: false, fg: 12 },
  ]);
});

test('256 and true colours, with semicolons or colons', () => {
  const spans = ansiLines([
    '\x1b[38;5;208ma\x1b[48;2;215;119;87mb\x1b[38:2::255:0:16mc\x1b[38:5:33md\x1b[39;49me',
  ])[0]?.spans;
  expect(spans).toEqual([
    { text: 'a', fg: 208 },
    { text: 'b', fg: 208, bg: '#d77757' },
    { text: 'c', fg: '#ff0010', bg: '#d77757' },
    { text: 'd', fg: 33, bg: '#d77757' },
    { text: 'e', fg: undefined, bg: undefined },
  ]);
});

test('a style carries over to the next line, as in a terminal', () => {
  const [, second] = ansiLines(['\x1b[2;3mthinking', 'still\x1b[22;23m done']);
  expect(second?.spans).toEqual([
    { text: 'still', dim: true, italic: true },
    { text: ' done', dim: false, italic: false, bold: false },
  ]);
});
