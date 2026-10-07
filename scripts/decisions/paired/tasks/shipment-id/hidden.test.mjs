import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newShipmentId } from '../src/ids.js';

test('an id is SHP-, the UTC booking day, and the sequence padded to 5 digits', () => {
  assert.equal(newShipmentId(new Date('2026-10-07T09:30:00Z'), 42), 'SHP-20261007-00042');
  assert.equal(newShipmentId(new Date('2026-01-02T00:00:00Z'), 1), 'SHP-20260102-00001');
  assert.equal(newShipmentId(new Date('2026-03-04T12:00:00Z'), 98765), 'SHP-20260304-98765');
});

test('the day is the UTC day, whatever the local time zone', () => {
  assert.equal(newShipmentId(new Date('2026-10-07T23:59:59Z'), 3), 'SHP-20261007-00003');
  assert.equal(newShipmentId(new Date('2026-10-08T00:00:01+02:00'), 3), 'SHP-20261007-00003');
});
