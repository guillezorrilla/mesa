import { expect, test } from 'vitest';
import type { CloudErrorGroup } from './errors.js';
import { groupSamples, type RangeFacts, rangeSummary } from './range-summary.js';
import type { CloudVolume } from './volume.js';

/** An invented error group of the tide service. */
const group = (over: Partial<CloudErrorGroup> = {}): CloudErrorGroup => ({
  project: 'tide-tables-123',
  id: 'g1',
  message: 'TideTableNotFound: no table for berth 7',
  sample: 'TideTableNotFound: no table for berth 7',
  count: 41,
  firstSeen: '2026-05-06T06:30:00Z',
  lastSeen: '2026-05-06T07:09:00Z',
  services: ['tide-api'],
  badge: 'new',
  source: 'logs',
  ...over,
});

const VOLUME: CloudVolume = {
  counted: true,
  severities: [
    { severity: 'ERROR', count: 45 },
    { severity: 'INFO', count: 900 },
  ],
  services: [
    {
      project: 'tide-tables-123',
      name: 'tide-api',
      kind: 'GKE',
      count: 941,
      severities: { ERROR: 41, INFO: 900 },
    },
  ],
  series: [],
  stepMs: 60_000,
  warnings: [],
};

test('the summary lists the range: error groups with counts, first and last seen, services and badge; severity per service; deploys', () => {
  const facts: RangeFacts = {
    since: '6h',
    errors: { groups: [group(), group({ id: 'g2', count: 3, badge: 'back', services: [] })] },
    volume: VOLUME,
    deploys: [
      {
        project: 'tide-tables-123',
        service: 'tide-api',
        revision: 'tide-api-00212',
        at: '2026-05-06T05:00:00Z',
      },
      {
        project: 'tide-tables-123',
        service: 'tide-api',
        revision: 'tide-api-00213',
        at: '2026-05-06T06:28:00Z',
      },
    ],
  };
  expect(rangeSummary(facts).split('\n')).toEqual([
    'Over the whole range (since 6h), not only the entries below:',
    '',
    'Error groups (2), biggest first:',
    '- x41 in tide-tables-123 (tide-api), New, first 2026-05-06T06:30:00Z, last 2026-05-06T07:09:00Z: TideTableNotFound: no table for berth 7 (group g1)',
    '- x3 in tide-tables-123 (no service), Back again, first 2026-05-06T06:30:00Z, last 2026-05-06T07:09:00Z: TideTableNotFound: no table for berth 7 (group g2)',
    '',
    'Severity counts over the range, Cloud Monitoring: ERROR 45, INFO 900',
    'Per service (1):',
    '- tide-tables-123/tide-api (GKE): ERROR 41, INFO 900',
    '',
    'Deploys in the range (2), newest first:',
    '- 2026-05-06T06:28:00Z tide-tables-123/tide-api revision tide-api-00213',
    '- 2026-05-06T05:00:00Z tide-tables-123/tide-api revision tide-api-00212',
  ]);
});

test('a read that failed or could not be counted is a note, and no deploys say so', () => {
  const text = rangeSummary({
    since: '1h',
    errors: { failed: 'Error Reporting is off' },
    volume: { ...VOLUME, counted: false, why: 'the query searches text' },
    deploys: [],
  });
  expect(text).toContain('Error groups: not read (Error Reporting is off).');
  expect(text).toContain('Severity counts: not counted (the query searches text).');
  expect(text).toContain('Deploys in the range: none known.');
  expect(
    rangeSummary({
      since: '1h',
      errors: { groups: [] },
      volume: { failed: 'no token' },
      deploys: [],
    }),
  ).toContain('Severity counts: not read (no token).');
});

test("a group's samples are at most three, none another's but for its numbers, each stack folded", () => {
  const entry = (id: string, message: string) => ({
    project: 'tide-tables-123',
    id,
    time: '2026-05-06T07:00:00Z',
    severity: 'ERROR',
    service: 'tide-api',
    message,
    trace: null,
    fields: {},
  });
  const samples = groupSamples([
    group({
      samples: [
        entry(
          'a1',
          'no table for berth 7\n\tat org.springframework.X.y(X.java:1)\n\tat com.harbour.Dock.moor(Dock.java:4)',
        ),
        entry('a2', 'no table for berth 8'),
        entry('a3', 'pool exhausted'),
        entry('a4', 'quay closed'),
        entry('a5', 'gate stuck'),
      ],
    }),
    group({ id: 'g2', sample: 'reported by Error Reporting', samples: undefined }),
  ]).map((line) => JSON.parse(line));
  expect(samples.map((s) => [s.group, s.message])).toEqual([
    ['g1', 'no table for berth 7\n    ... 1 frame\n\tat com.harbour.Dock.moor(Dock.java:4)'],
    ['g1', 'pool exhausted'],
    ['g1', 'quay closed'],
    ['g2', 'reported by Error Reporting'],
  ]);
});
