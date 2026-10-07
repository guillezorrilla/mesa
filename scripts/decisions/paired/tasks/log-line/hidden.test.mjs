import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logLine } from '../src/log.js';

test('a log line is one JSON object whose first key is event', () => {
  const line = logLine('shipment.booked', { id: 'SHP-1', parcels: 2 });
  assert.equal(line.includes('\n'), false);
  const parsed = JSON.parse(line);
  assert.deepEqual(Object.keys(parsed)[0], 'event');
  assert.deepEqual(parsed, { event: 'shipment.booked', id: 'SHP-1', parcels: 2 });
});

test('a field whose name ends in Email is redacted', () => {
  const parsed = JSON.parse(
    logLine('shipment.booked', {
      customerEmail: 'ana@example.invalid',
      courierEmail: 'x@y.invalid',
    }),
  );
  assert.equal(parsed.customerEmail, '[redacted]');
  assert.equal(parsed.courierEmail, '[redacted]');
  assert.equal(JSON.stringify(parsed).includes('@'), false);
});
