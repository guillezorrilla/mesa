import { expect, test } from 'vitest';
import { folderEntries, nameOf, parentOf } from './folderEntries';

const entries = [
  { path: 'README.md', dir: false },
  { path: 'src', dir: true },
  { path: 'src/tide.ts', dir: false },
  { path: 'src/charts', dir: true },
  { path: 'src/charts/ebb.ts', dir: false },
];

test('a folder lists what it holds directly, folders first', () => {
  expect(folderEntries(entries, '').map((e) => e.path)).toEqual(['src', 'README.md']);
  expect(folderEntries(entries, 'src').map((e) => e.path)).toEqual(['src/charts', 'src/tide.ts']);
  expect([parentOf('src/charts/ebb.ts'), parentOf('README.md')]).toEqual(['src/charts', '']);
  expect(nameOf('src/charts/ebb.ts')).toBe('ebb.ts');
});
