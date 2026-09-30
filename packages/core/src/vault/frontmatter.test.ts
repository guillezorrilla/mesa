import { expect, test } from 'vitest';
import { parseNote } from './frontmatter.js';

test.each([
  ['\n', '\n'],
  ['\r\n', '\r\n'],
  ['\n', '\r\n'],
  ['\r\n', '\n'],
])('empty frontmatter fences accept %j then %j without changing the body', (open, close) => {
  const body = '# Authored tide\r\n\r\nKeep these lines.\n---\nLast line 🐚';
  expect(parseNote(`---${open}---${close}${body}`)).toEqual({ frontmatter: {}, body });
});

test.each([
  'Just body.\r\n',
  '\n---\ntitle: Tide\n---\nBody.',
  '--- \ntitle: Tide\n---\nBody.',
  '---\rtitle: Tide\r---\rBody.',
  '---\ntitle: Tide\n---',
  '---\r\ntitle: Tide\r\n',
  '---\r\ntitle: Tide\r\n--- \r\nBody.',
])('missing or invalid fences retain the all-body fallback: %j', (text) => {
  expect(parseNote(text)).toEqual({ frontmatter: {}, body: text });
});

test.each(['\n', '\r\n'])('malformed YAML still throws for the reader to handle: %j', (newline) => {
  expect(() => parseNote(`---${newline}title: [unclosed${newline}---${newline}Body.`)).toThrow();
});
