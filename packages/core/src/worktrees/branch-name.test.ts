import { expect, test } from 'vitest';
import { shortIds } from '../testing/index.js';
import { sessionBranchName } from './branch-name.js';

test('a session branch is session/<adjective>-<noun>-<4 characters>, from a new id', () => {
  // The id's last six characters: the adjective's, the noun's (Crockford positions), then four.
  const next = shortIds('0000k2p4', '00zz9xab');
  expect(sessionBranchName(next)).toBe('session/amber-badger-k2p4');
  expect(sessionBranchName(next)).toBe('session/zesty-zebra-9xab');
});
