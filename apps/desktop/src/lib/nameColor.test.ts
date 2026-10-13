import { expect, test } from 'vitest';
import { nameColor } from './nameColor';

test('a name always gets the same series color, and names spread across the series', () => {
  expect(nameColor('harbor-gate')).toBe(nameColor('harbor-gate'));
  expect(nameColor('harbor-gate')).toMatch(/^var\(--series-[1-8]\)$/);
  const names = ['harbor-gate', 'tide-pool', 'lantern-cove', 'pier', 'beacon', 'reef', 'dune'];
  expect(new Set(names.map(nameColor)).size).toBeGreaterThan(3);
});
