import { expect, test } from 'vitest';
import type { CloudLogEntry } from './gcp.js';
import {
  groupStats,
  type IncidentGroup,
  incidentReasons,
  incidentsOf,
  linkReason,
} from './incidents.js';

const FROM = Date.parse('2026-05-06T07:00:00Z');
const RANGE = { from: FROM, to: FROM + 30 * 60_000 };
let n = 0;
/** An invented entry `minute` minutes into the range. */
const entry = (
  minute: number,
  message: string,
  extra: Partial<CloudLogEntry> = {},
): CloudLogEntry => ({
  project: 'tide-tables-123',
  id: `e${n++}`,
  time: new Date(FROM + minute * 60_000 + 1000).toISOString(),
  severity: 'ERROR',
  service: 'tide-api',
  message,
  trace: null,
  fields: {},
  ...extra,
});
const group = (key: string, service: string, entries: CloudLogEntry[]): IncidentGroup => ({
  key,
  message: entries[0]?.message ?? '',
  services: [service],
  entries,
});

test('a shared trace links a gateway 502 to the API error behind it, and the API is the origin', () => {
  const api = group('p api', 'tide-api', [
    entry(5, 'TideTableNotFound: LC-04', { trace: 'projects/p/traces/aa11' }),
  ]);
  const web = group('p web', 'harbour-web', [
    entry(5, 'GET /checkout 502 1840ms', { trace: 'projects/p/traces/aa11' }),
  ]);
  const job = group('p job', 'tide-worker', [entry(20, 'mooring sync failed')]);
  const [incident, ...rest] = incidentsOf([web, api, job], RANGE);
  expect(rest).toEqual([]);
  expect(incident).toMatchObject({
    groups: ['p web', 'p api'],
    origin: 'p api',
    services: ['harbour-web', 'tide-api'],
  });
  expect(incident?.links).toEqual([
    { from: 'p web', to: 'p api', reason: 'trace', detail: '1', strength: 0.9 },
  ]);
});

test('a shared request id, a shared context value and a shared revision each link, with their reason', () => {
  const request = incidentsOf(
    [
      group('a', 's1', [entry(1, 'lookup failed request_id=9f2c4e6a')]),
      group('b', 's2', [entry(2, 'checkout 500 request_id=9f2c4e6a')]),
    ],
    RANGE,
  );
  expect(request[0]?.links.map((l) => [l.reason, l.detail])).toEqual([['request', '1']]);
  const context = incidentsOf(
    [
      group('a', 's1', [entry(1, 'quote failed', { fields: { company: 'Lantern Cove' } })]),
      group('b', 's2', [entry(9, 'invoice failed', { fields: { company: 'Lantern Cove' } })]),
      group('c', 's3', [entry(15, 'unrelated', { fields: { company: 'Quiet Reef' } })]),
    ],
    RANGE,
  );
  expect(context).toHaveLength(1);
  expect(context[0]?.links[0]).toMatchObject({
    reason: 'context',
    detail: 'company=Lantern Cove',
    strength: 0.7,
  });
  const revision = incidentsOf(
    [
      group('a', 's1', [entry(1, 'npe', { fields: { revision: 'tide-api-00042' } })]),
      group('b', 's2', [entry(3, 'timeout', { fields: { revision: 'tide-api-00042' } })]),
    ],
    RANGE,
  );
  expect(revision[0]?.links[0]).toMatchObject({
    reason: 'revision',
    detail: 'tide-api-00042',
    strength: 0.45,
  });
});

test('counts that rise together over enough minutes and events link, with their reason in words; two bars, a broad value or flat noise do not', () => {
  // Twelve busy minutes, more errors as they go, in both groups.
  const rising = (message: string) =>
    Array.from({ length: 12 }, (_, m) =>
      Array.from({ length: 1 + m }, () => entry(5 + m, message)),
    ).flat();
  const together = incidentsOf(
    [group('a', 's1', rising('pool exhausted')), group('b', 's2', rising('quote timeout'))],
    RANGE,
  );
  expect(together[0]?.links.map((l) => [l.reason, l.detail])).toEqual([
    ['counts', 'r 1.00 over 12 minutes'],
  ]);
  expect(incidentReasons(together[0]?.links ?? [])).toBe(
    'Linked because they rise together, r 1.00 over 12 minutes',
  );
  // Two busy minutes each: r 1.00, but noise.
  const twoBars = (message: string) => [
    ...Array.from({ length: 6 }, () => entry(3, message)),
    ...Array.from({ length: 6 }, () => entry(9, message)),
  ];
  expect(
    incidentsOf(
      [group('a', 's1', twoBars('disk full')), group('b', 's2', twoBars('bad token'))],
      RANGE,
    ),
  ).toEqual([]);
  const apart = incidentsOf(
    [
      group('a', 's1', [
        entry(1, 'disk full', { fields: { env: 'prod' } }),
        entry(20, 'disk full', { fields: { env: 'prod' } }),
      ]),
      group('b', 's2', [entry(8, 'bad token', { fields: { env: 'prod' } })]),
    ],
    RANGE,
  );
  expect(apart).toEqual([]);
  expect(linkReason({ reason: 'trace', detail: '212' })).toBe('share 212 traces');
});

test("a group's stats: counts over the range, message variants without their ids, facets", () => {
  const stats = groupStats(
    [
      entry(1, 'no table for station LC-04', { fields: { company: 'Lantern Cove' } }),
      entry(2, 'no table for station QR-02', { fields: { company: 'Quiet Reef' } }),
      entry(29, 'no cache', { fields: { company: 'Lantern Cove' } }),
    ],
    RANGE,
    3,
  );
  expect(stats.spark).toEqual([2, 0, 1]);
  expect(stats.variants).toEqual([
    { message: 'no table for station LC-04', count: 2 },
    { message: 'no cache', count: 1 },
  ]);
  expect(stats.facets).toEqual([
    {
      key: 'company',
      values: [
        { value: 'Lantern Cove', count: 2 },
        { value: 'Quiet Reef', count: 1 },
      ],
    },
  ]);
});
