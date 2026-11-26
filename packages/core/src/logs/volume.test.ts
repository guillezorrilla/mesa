import { expect, test } from 'vitest';
import type { Http } from '../lib/http.js';
import { scriptedRunner } from '../testing/runner.js';
import type { GcpLogs } from './gcp-config.js';
import { monitoringFilter } from './monitoring-filter.js';
import { cloudVolume } from './volume.js';

const NOW = new Date('2026-05-06T08:00:00Z');
const CONFIG: GcpLogs = {
  projects: ['tide-tables-123', 'harbour-web-456'],
  envs: {
    beta: 'resource.labels.cluster_name="harbour-beta"',
    prod: 'resource.labels.cluster_name="harbour-prod"',
  },
};
const token = scriptedRunner({ gcloud: 'ya29.invented\n' }).run;
const point = (minute: number, count: number) => ({
  interval: { startTime: `2026-05-06T07:${String(minute).padStart(2, '0')}:00Z` },
  value: { int64Value: String(count) },
});
const series = (
  severity: string,
  type: string,
  labels: Record<string, string>,
  points: object[],
) => ({
  metric: { labels: { severity } },
  resource: { type, labels },
  points,
});

/** Cloud Monitoring answering `byProject`'s series, every URL kept. */
function monitoring(byProject: Record<string, unknown[] | number>) {
  const urls: string[] = [];
  const http: Http = async (url) => {
    urls.push(url);
    const project = decodeURIComponent(/projects\/([^/]+)\/timeSeries/.exec(url)?.[1] ?? '');
    const answer = byProject[project];
    if (typeof answer === 'number') return new Response('{}', { status: answer });
    return new Response(JSON.stringify({ timeSeries: answer ?? [] }));
  };
  return { http, urls };
}

test("the range's entries by severity, service and minute come from log_entry_count, so a rare ERROR shows however few the page holds", async () => {
  const { http, urls } = monitoring({
    'tide-tables-123': [
      series('ERROR', 'k8s_container', { container_name: 'tide-api' }, [
        point(10, 3),
        point(50, 1),
      ]),
      series('INFO', 'k8s_container', { container_name: 'tide-api' }, [point(10, 900)]),
    ],
    'harbour-web-456': [
      series('WARNING', 'cloud_run_revision', { service_name: 'harbour-web' }, [point(50, 40)]),
    ],
  });
  const volume = await cloudVolume({ run: token, http, now: () => NOW }, CONFIG, { env: 'beta' });
  expect(volume.counted).toBe(true);
  expect(volume.severities).toEqual([
    { severity: 'ERROR', count: 4 },
    { severity: 'WARNING', count: 40 },
    { severity: 'INFO', count: 900 },
  ]);
  expect(volume.services).toEqual([
    {
      project: 'tide-tables-123',
      name: 'tide-api',
      kind: 'GKE',
      count: 904,
      severities: { ERROR: 4, INFO: 900 },
    },
    {
      project: 'harbour-web-456',
      name: 'harbour-web',
      kind: 'Cloud Run',
      count: 40,
      severities: { WARNING: 40 },
    },
  ]);
  expect(volume.stepMs).toBe(60_000);
  expect(volume.series).toEqual([
    { start: '2026-05-06T07:10:00Z', count: 903, errors: 3 },
    { start: '2026-05-06T07:50:00Z', count: 41, errors: 1 },
  ]);
  const filter = new URL(urls[0] ?? '').searchParams.get('filter') ?? '';
  expect(filter).toContain('metric.type = "logging.googleapis.com/log_entry_count"');
  expect(filter).toContain('(resource.labels.cluster_name = "harbour-beta")');
  expect(filter).toContain('NOT resource.type = one_of(');
  expect(new URL(urls[0] ?? '').searchParams.getAll('aggregation.groupByFields')).toContain(
    'metric.label.severity',
  );
});

test('a query Monitoring cannot apply is not counted, and says why; a project it cannot read is a warning', async () => {
  const { http, urls } = monitoring({ 'tide-tables-123': 403, 'harbour-web-456': [] });
  const deps = { run: token, http, now: () => NOW };
  expect(await cloudVolume(deps, CONFIG, { text: 'berth' })).toMatchObject({
    counted: false,
    why: expect.stringContaining('text, a trace or fields'),
  });
  expect(urls).toHaveLength(0);
  expect(
    await cloudVolume(deps, CONFIG, { filter: 'jsonPayload.company="Quiet Reef"' }),
  ).toMatchObject({
    counted: false,
  });
  const partly = await cloudVolume(deps, CONFIG, { severity: 'warning' });
  expect(partly.counted).toBe(true);
  expect(partly.warnings[0]?.project).toBe('tide-tables-123');
  const severity = new URL(urls.at(-1) ?? '').searchParams.get('filter') ?? '';
  expect(severity).toContain(
    'metric.labels.severity = one_of("EMERGENCY", "ALERT", "CRITICAL", "ERROR", "WARNING")',
  );
});

test("the fields pane's clauses and every env the setup writes read in Monitoring's terms; a term that cannot names itself", () => {
  const f = (filter: string) => monitoringFilter(filter);
  expect(f('severity=ERROR\nAND NOT severity=DEBUG')).toEqual({
    filter: 'metric.labels.severity = "ERROR" AND NOT metric.labels.severity = "DEBUG"',
  });
  expect(
    f('(resource.labels.container_name="tide-api" OR resource.labels.service_name="tide-api")'),
  ).toEqual({
    filter:
      '(resource.labels.container_name = "tide-api" OR resource.labels.service_name = "tide-api")',
  });
  expect(f('resource.type=("k8s_container" OR "gae_app")')).toEqual({
    filter: 'resource.type = one_of("k8s_container", "gae_app")',
  });
  expect(f('severity>=ERROR')).toEqual({
    filter: 'metric.labels.severity = one_of("EMERGENCY", "ALERT", "CRITICAL", "ERROR")',
  });
  // The setup's envs: a cluster, a Cloud Run suffix, and prod as the rest.
  expect(f('resource.labels.cluster_name="harbour-prod"')).toEqual({
    filter: 'resource.labels.cluster_name = "harbour-prod"',
  });
  expect(
    f('resource.type="cloud_run_revision" AND resource.labels.service_name=~"-beta$"'),
  ).toEqual({
    filter:
      'resource.type = "cloud_run_revision" AND resource.labels.service_name = monitoring.regex.full_match(".*(?:-beta$).*")',
  });
  expect(
    f('resource.type="cloud_run_revision" AND NOT resource.labels.service_name=~"-(beta|dev)$"'),
  ).toEqual({
    filter:
      'resource.type = "cloud_run_revision" AND NOT resource.labels.service_name = monitoring.regex.full_match(".*(?:-(beta|dev)$).*")',
  });
  expect(
    f('resource.labels.namespace_name!="kube-system" AND resource.labels.project_id:"tide"'),
  ).toEqual({
    filter:
      'NOT resource.labels.namespace_name = "kube-system" AND resource.labels.project_id = has_substring("tide")',
  });
  expect(f('jsonPayload.company="Quiet Reef"')).toEqual({ unmapped: 'jsonPayload.company' });
  expect(f('"lookup failed"')).toEqual({ unmapped: 'the text "lookup failed"' });
  expect(f('resource.labels.cluster_name="harbour-prod" AND logName:"requests"')).toEqual({
    unmapped: 'logName',
  });
});
