import { expect, test } from 'vitest';
import { groupLabel } from './labelText';

test("a group's label names who spoke and how long ago", () => {
  const now = Date.parse('2026-11-12T12:00:00.000Z');
  expect(groupLabel('agent', '2026-11-12T11:55:00.000Z', now)).toBe('Agent · 5m ago');
  expect(groupLabel('you', '2026-11-12T10:00:00.000Z', now)).toBe('You · 2h ago');
  expect(groupLabel('you', null, now)).toBe('You');
});
