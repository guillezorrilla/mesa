import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortShipments } from '../src/shipments.js';

const LIST = [
  { id: 'a', priority: 'standard', dueAt: '2026-10-07T08:00:00Z' },
  { id: 'b', priority: 'fragile', dueAt: '2026-10-07T12:00:00Z' },
  { id: 'c', priority: 'cold', dueAt: '2026-10-07T18:00:00Z' },
  { id: 'd', priority: 'fragile', dueAt: '2026-10-07T09:00:00Z' },
  { id: 'e', priority: 'cold', dueAt: '2026-10-07T07:00:00Z' },
];

test('cold first, then fragile, then standard; earliest due first within each', () => {
  assert.deepEqual(
    sortShipments(LIST).map((s) => s.id),
    ['e', 'c', 'd', 'b', 'a'],
  );
});

test("sorting returns a new array and leaves the caller's as it was", () => {
  const before = LIST.map((s) => s.id);
  const sorted = sortShipments(LIST);
  assert.notEqual(sorted, LIST);
  assert.deepEqual(
    LIST.map((s) => s.id),
    before,
  );
});
