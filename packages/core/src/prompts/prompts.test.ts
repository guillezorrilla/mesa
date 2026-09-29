import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { profilePaths, tempDir, testDeps } from '../testing/index.js';

test('saved prompts keep exact multiline text in one profile and never replace implicitly', () => {
  const home = tempDir();
  const first = createMesa('first', testDeps(home));
  const other = createMesa('other', testDeps(home));
  first.init({ vault: 'vault-first' });
  other.init({ vault: 'vault-other' });
  const text = 'First line\n\n  indented line\n';
  expect(first.prompts.save('Review', text)).toEqual({ name: 'Review', text });
  expect(first.prompts.list()).toEqual([{ name: 'Review', text }]);
  expect(other.prompts.list()).toEqual([]);
  const file = profilePaths(home, 'first').prompts;
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([{ name: 'Review', text }]);
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(() => first.prompts.save('review', 'replacement')).toThrow('already exists');
  expect(first.prompts.list()[0]?.text).toBe(text);
  expect(first.prompts.save('Review', 'replacement', true).text).toBe('replacement');
  expect(first.prompts.remove('review').text).toBe('replacement');
  expect(first.prompts.list()).toEqual([]);
});

test('saved prompt validation leaves the previous file untouched', () => {
  const home = tempDir();
  const mesa = createMesa('first', testDeps(home));
  mesa.init({ vault: 'vault' });
  mesa.prompts.save('Keep', 'body');
  const file = profilePaths(home, 'first').prompts;
  const before = readFileSync(file, 'utf8');
  expect(() => mesa.prompts.save(' ', 'body')).toThrow();
  expect(() => mesa.prompts.save('New', '')).toThrow();
  expect(() => mesa.prompts.remove('missing')).toThrow();
  expect(readFileSync(file, 'utf8')).toBe(before);
  writeFileSync(
    file,
    JSON.stringify([
      { name: 'Keep', text: 'a' },
      { name: 'keep', text: 'b' },
    ]),
  );
  expect(() => mesa.prompts.list()).toThrow('saved prompt names must be unique');
});
