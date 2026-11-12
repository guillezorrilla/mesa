import { expect, test } from 'vitest';
import { entryLabel, hitPlace } from './fileWords';

test('a row says its name and whether it is a folder; a hit says its line when it has one', () => {
  expect(entryLabel({ name: '..', dir: true })).toBe('Up one folder');
  expect(entryLabel({ name: 'src', dir: true })).toBe('src, folder');
  expect(entryLabel({ name: 'tide.ts', dir: false })).toBe('tide.ts');
  expect(hitPlace({ path: 'src/tide.ts', line: 4 })).toBe('src/tide.ts:4');
  expect(hitPlace({ path: 'src/tide.ts', line: 0 })).toBe('src/tide.ts');
});
