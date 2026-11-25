import { expect, test } from 'vitest';
import { groupText, occurrenceRuns } from './occurrences.js';

test("a group's text stops before its first id or count; identical neighbours make one run", () => {
  expect(
    groupText('TideTableNotFoundException: no table for station LC-04 on 2026-11-25\n  at x'),
  ).toBe('TideTableNotFoundException: no table for station');
  expect(groupText('GET /checkout 502 1840ms')).toBe('GET /checkout');
  const at = (time: string, message: string) => ({ time, message });
  const runs = occurrenceRuns([
    at('15:18:45', 'lookup failed for order 18240'),
    at('15:18:40', 'lookup failed for order 18233'),
    at('15:18:35', 'lookup failed for order 18100'),
    at('15:17:00', 'checkout stalled'),
    at('15:16:00', 'lookup failed for order 17000'),
  ]);
  expect(runs.map((r) => [r.entries.length, r.newest, r.oldest])).toEqual([
    [3, '15:18:45', '15:18:35'],
    [1, '15:17:00', '15:17:00'],
    [1, '15:16:00', '15:16:00'],
  ]);
});
