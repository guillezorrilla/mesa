import { expect, test } from 'vitest';
import { gitDone } from './gitDone';

test('each action says what it did', () => {
  const id = 's1';
  expect(gitDone({ method: 'stage', id, path: 'a.ts', staged: false }, {})).toBe('Unstaged a.ts.');
  expect(gitDone({ method: 'commit', id, message: 'x' }, { oid: 'abc1234def' })).toBe(
    'Committed abc1234.',
  );
  const synced = { remote: 'origin', upstream: 'tide' };
  expect(gitDone({ method: 'sync', id, action: 'push' }, synced)).toBe('Pushed to origin/tide.');
  expect(gitDone({ method: 'sync', id, action: 'pull' }, synced)).toBe('Pulled from origin/tide.');
  expect(gitDone({ method: 'switch', id, name: 'spare' }, {})).toBe('Switched to spare.');
});
