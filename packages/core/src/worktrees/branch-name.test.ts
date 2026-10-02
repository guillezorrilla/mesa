import { expect, test } from 'vitest';
import { shortIds } from '../testing/index.js';
import { sessionBranchName } from './branch-name.js';

test('a session branch is session/<adjective>-<noun>-<4 characters>, from a new id', () => {
  const next = shortIds('00004k2p', '0000k7zz9x'.slice(-8));
  const first = sessionBranchName(next);
  const second = sessionBranchName(next);
  expect(first).toMatch(/^session\/[a-z]+-[a-z]+-4k2p$/);
  expect(second).toMatch(/^session\/[a-z]+-[a-z]+-zz9x$/);
  // The words come from the id too: the same id names the same branch.
  expect(sessionBranchName(shortIds('00004k2p'))).toBe(first);
  expect(first).not.toBe(second.replace('zz9x', '4k2p'));
});
