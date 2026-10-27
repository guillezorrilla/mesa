import { expect, test } from 'vitest';
import { tally } from './DiffStatBar';

test('the diffstat fills more cells for bigger changes, green for added first', () => {
  expect(tally(0, 0)).toEqual(['empty', 'empty', 'empty', 'empty', 'empty']);
  expect(tally(1, 0)).toEqual(['added', 'empty', 'empty', 'empty', 'empty']);
  expect(tally(60, 40)).toEqual(['added', 'added', 'added', 'removed', 'removed']);
});
