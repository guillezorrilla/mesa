import { expect, test } from 'vitest';
import { fieldStats } from './facets.js';

test("the fields pane's tiers: the app's own context first, plumbing under More, ids and timestamps only when searched", () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({
    fields: {
      company: i % 3 ? 'Lantern Cove' : 'Quiet Reef',
      status: i % 2 ? '200' : '500',
      logger: 'com.tides.webhook.domain.TideWebhookService',
      thread_name: 'http-nio-8080-exec-1',
      timeline: 'harbour',
      LOCALTIMESTAMP: `2026-05-06T07:${String(i).padStart(2, '0')}:00`,
    },
  }));
  const stats = fieldStats(entries);
  expect(stats.map((s) => [s.key, s.tier])).toEqual([
    ['company', 'main'],
    ['status', 'main'],
    // A word inside another (line in timeline) is no plumbing.
    ['timeline', 'main'],
    ['logger', 'more'],
    ['thread_name', 'more'],
    ['LOCALTIMESTAMP', 'unique'],
  ]);
  expect(stats[0]).toMatchObject({
    present: 30,
    values: [
      { value: 'Lantern Cove', count: 20 },
      { value: 'Quiet Reef', count: 10 },
    ],
  });
  expect(stats.at(-1)?.values).toHaveLength(30);
});
