import { expect, test } from 'vitest';
import { pathParts } from './pathParts';

test('a path splits into the folder it is in and its name', () => {
  expect(pathParts('src/charts/ebb.ts')).toEqual({ folder: 'src/charts', name: 'ebb.ts' });
  expect(pathParts('README.md')).toEqual({ folder: '', name: 'README.md' });
});
