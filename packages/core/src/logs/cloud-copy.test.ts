import { expect, test } from 'vitest';
import {
  cloudCopyText,
  cloudGroupSummary,
  consoleUrl,
  entryConsoleUrl,
  groupQuery,
} from './cloud-copy.js';

const ENTRY = {
  project: 'tide-tables-123',
  id: 'aa11',
  time: '2026-05-06T07:09:00Z',
  severity: 'ERROR',
  service: 'tide-api',
  message:
    'TideTableNotFound: LC-04 request_id=9f2c4e6a\n    at tides.load (tides.ts:9)\n    at tides.get (tides.ts:20)',
  trace: 'projects/tide-tables-123/traces/0f0f9',
  fields: { company: 'Lantern Cove' },
};

test('a Cloud entry copies ready to paste with its whole stack, its project, trace, insert id and fields', () => {
  const text = cloudCopyText([ENTRY], 'paste');
  expect(text).toContain('ERROR 2026-05-06T07:09:00Z · tide-tables-123/tide-api');
  expect(text).toContain('at tides.get (tides.ts:20)');
  for (const field of [
    'request: 9f2c4e6a',
    'trace: 0f0f9',
    'insertId: aa11',
    'company: Lantern Cove',
  ])
    expect(text).toContain(field);
  expect(JSON.parse(cloudCopyText([ENTRY], 'json'))).toEqual(ENTRY);
  expect(cloudCopyText([ENTRY], 'message')).toBe('TideTableNotFound: LC-04 request_id=9f2c4e6a');
});

test('Console links open the Logs Explorer on a query and range, or on one entry at its time', () => {
  expect(
    consoleUrl('tide-tables-123', 'severity>=ERROR AND textPayload:"x"', { since: '6h' }),
  ).toBe(
    'https://console.cloud.google.com/logs/query;query=severity%3E%3DERROR%20AND%20textPayload%3A%22x%22;duration=PT6H?project=tide-tables-123',
  );
  expect(entryConsoleUrl(ENTRY)).toBe(
    'https://console.cloud.google.com/logs/query;query=insertId%3D%22aa11%22;cursorTimestamp=2026-05-06T07%3A09%3A00Z;duration=P1D?project=tide-tables-123',
  );
});

test("a group's query reads its errors by service and the words of its message", () => {
  expect(
    groupQuery({
      message: 'TideTableNotFound at tides.ts:9',
      sample: 'TideTableNotFound: no table for station LC-04\n  at tides.load (tides.ts:9)',
      services: ['tide-api'],
    }),
  ).toBe(
    'severity>=ERROR AND (resource.labels.container_name="tide-api" OR resource.labels.service_name="tide-api" OR resource.labels.module_id="tide-api") AND "TideTableNotFound: no table for station"',
  );
});

test("a group's query names its service under logs.gcp.service when one is set", () => {
  expect(
    groupQuery(
      { message: 'x', sample: 'lookup failed for berth', services: ['tide-api'] },
      { service: 'labels.app' },
    ),
  ).toBe('severity>=ERROR AND labels.app="tide-api" AND "lookup failed for berth"');
});

test('a group summary names its count, first and last seen, services and its newest entry whole', () => {
  const summary = cloudGroupSummary(
    {
      project: 'tide-tables-123',
      id: 'g1',
      message: 'TideTableNotFound at tides.ts:9',
      sample: '',
      count: 412,
      firstSeen: '2026-05-06T06:30:00Z',
      lastSeen: '2026-05-06T07:09:00Z',
      services: ['tide-api'],
      badge: 'new',
      source: 'logs',
    },
    [ENTRY],
  );
  expect(summary.split('\n').slice(0, 4)).toEqual([
    'TideTableNotFound at tides.ts:9 (x412)',
    'First seen: 2026-05-06T06:30:00Z',
    'Last seen: 2026-05-06T07:09:00Z',
    'Services: tide-api',
  ]);
  expect(summary).toContain('at tides.get (tides.ts:20)');
});
