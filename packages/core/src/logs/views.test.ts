import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import type { Http } from '../lib/http.js';
import { scriptedRunner, tempDir } from '../testing/index.js';
import { maskText } from './mask.js';
import { metricCounts, metricViews } from './metrics.js';
import { exportViews, importViews, mergeViews } from './views.js';

const NOW = new Date('2026-05-06T07:10:00.000Z');

test('each log-based metric becomes a view with its filter, project and metric', async () => {
  const { run, calls } = scriptedRunner({
    gcloud: JSON.stringify([
      {
        name: 'checkout-errors',
        filter: 'resource.labels.service_name="harbour-web" AND severity>=ERROR',
      },
      { name: 'empty' },
    ]),
  });
  expect(await metricViews(run, 'harbour-web-456')).toEqual([
    {
      name: 'checkout-errors',
      filter: 'resource.labels.service_name="harbour-web" AND severity>=ERROR',
      projects: ['harbour-web-456'],
      metric: 'checkout-errors',
    },
  ]);
  expect(calls[0]?.args).toEqual([
    'logging',
    'metrics',
    'list',
    '--project',
    'harbour-web-456',
    '--format',
    'json(name,filter)',
  ]);
});

test("a metric's counts per 5 minutes come from Cloud Monitoring, summed across a view's projects, its name quoted", async () => {
  const asked: string[] = [];
  const http: Http = async (url) => {
    asked.push(url);
    return new Response(
      JSON.stringify({
        timeSeries: [
          {
            points: [
              { interval: { startTime: '2026-05-06T07:05:00Z' }, value: { int64Value: '7' } },
              { interval: { startTime: '2026-05-06T07:00:00Z' }, value: { int64Value: '2' } },
            ],
          },
        ],
      }),
    );
  };
  const { run } = scriptedRunner({ gcloud: 'ya29.invented' });
  const found = await metricCounts(
    { run, http, now: () => NOW },
    ['harbour-web-456', 'tide-tables-123'],
    'checkout"errors',
    '1h',
  );
  expect(found).toEqual({
    counts: [
      { start: '2026-05-06T07:00:00Z', count: 4 },
      { start: '2026-05-06T07:05:00Z', count: 14 },
    ],
    warnings: [],
  });
  expect(asked.map((url) => url.split('/projects/')[1]?.split('/')[0])).toEqual([
    'harbour-web-456',
    'tide-tables-123',
  ]);
  expect(new URL(asked[0] ?? '').searchParams.get('filter')).toBe(
    'metric.type="logging.googleapis.com/user/checkout\\"errors"',
  );
});

test('views share as YAML: exported, imported, a kept name replaced; a malformed file is invalid_config', () => {
  const file = join(tempDir(), 'views.yaml');
  const views = [
    { name: 'checkout', services: ['harbour-web-456/harbour-web', 'tide-tables-123/tide-api'] },
  ];
  exportViews(file, views);
  expect(readFileSync(file, 'utf8')).toContain('harbour-web-456/harbour-web');
  expect(importViews(file)).toEqual(views);
  expect(
    mergeViews([{ name: 'checkout', severity: 'error' }, { name: 'prod errors' }], views).map(
      (v) => v.name,
    ),
  ).toEqual(['prod errors', 'checkout']);
  exportViews(file, [{ name: '' }] as never);
  expect(() => importViews(file)).toThrow(expect.objectContaining({ code: 'invalid_config' }));
});

test('emails and IP addresses are masked', () => {
  expect(
    maskText('login for skipper@lantern-cove.example from 10.2.3.4 and fe80:0:0:0:1:2:3:4'),
  ).toBe('login for <email> from <ip> and <ip>');
});
