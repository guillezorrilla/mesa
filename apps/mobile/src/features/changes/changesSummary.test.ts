import { expect, test } from 'vitest';
import { changesSummary } from './changesSummary';

test('the summary names the branch and base, files viewed, and new files left out', () => {
  const changes = { branch: 'tide', base: 'main', files: [1, 2, 3], omitted: 0 };
  expect(changesSummary(changes, 1)).toBe('tide against main, 1 of 3 viewed');
  expect(changesSummary({ ...changes, branch: null, omitted: 4 }, 0)).toBe(
    'Detached HEAD against main, 0 of 3 viewed; 4 new files left out',
  );
});
