import { expect, test } from 'vitest';
import { messageParts, namesRequest, requestIds } from './tokens.js';

test('request ids, 4xx and 5xx statuses and slow durations are parts of their own', () => {
  expect(messageParts('POST /moorings 500 1.24s reqId=7f3a slow')).toEqual([
    { text: 'POST /moorings ' },
    { text: '500', status: 'failed' },
    { text: ' ' },
    { text: '1.24s', slow: true },
    { text: ' ' },
    { text: 'reqId=7f3a', request: '7f3a' },
    { text: ' slow' },
  ]);
  expect(messageParts('GET /tides 404 12ms status=503')).toEqual([
    { text: 'GET /tides ' },
    { text: '404', status: 'waiting' },
    { text: ' 12ms status=' },
    { text: '503', status: 'failed' },
  ]);
  expect(messageParts('Completed 500 INTERNAL_SERVER_ERROR, 404 NOT_FOUND')).toEqual([
    { text: 'Completed ' },
    { text: '500', status: 'failed' },
    { text: ' INTERNAL_SERVER_ERROR, ' },
    { text: '404', status: 'waiting' },
    { text: ' NOT_FOUND' },
  ]);
  expect(messageParts('[06/May/2026 07:08:11] "POST /moorings HTTP/1.1" 500 145')).toEqual([
    { text: '[06/May/2026 07:08:11] "POST /moorings HTTP/1.1" ' },
    { text: '500', status: 'failed' },
    { text: ' 145' },
  ]);
  expect(messageParts('GET /tides 200 2ms took 999ms')).toEqual([
    { text: 'GET /tides 200 2ms took 999ms' },
  ]);
});

test('every way of naming a request is read', () => {
  expect(
    requestIds(
      'requestId: ab-12 traceId=c0ffee trace_id="d00d1" X-Request-Id: e-55 correlationId=f9f9',
    ),
  ).toEqual(['ab-12', 'c0ffee', 'd00d1', 'e-55', 'f9f9']);
  expect(namesRequest('POST /moorings reqId=7f3a', '7f3a')).toBe(true);
  expect(namesRequest('POST /moorings reqId=7f3ab', '7f3a')).toBe(false);
});
