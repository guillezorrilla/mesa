import { SEVERITIES, severityRank } from './cloud-entry.js';
import type { ErrorDeps } from './errors.js';
import { SERVICE_LABELS } from './filter-text.js';
import { accessToken, type CloudWarning, eachProject, googleGet } from './gcloud.js';
import type { CloudQuery } from './gcp.js';
import { cloudFilters, envOf, servicesByProject } from './gcp.js';
import type { GcpLogs } from './gcp-config.js';
import { monitoringFilter } from './monitoring-filter.js';
import { OWN_SERVICES_MONITORING } from './noise.js';
import { sinceTime } from './since.js';

// How many entries the whole range holds (CONTEXT.md, Cloud Logs), not the page read: Cloud
// Monitoring's system metric logging.googleapis.com/log_entry_count, by severity and by service,
// over time, read with the same gcloud token as the metric counts. Only a query Monitoring can
// apply (env, projects, services, severity, the fields pane's clauses) is counted; any other is not,
// with why, and the Explorer counts the page instead.

/** The entries of a range: by severity and service, and over time with its errors. */
export type CloudVolume = {
  /** Counted by Cloud Monitoring over the whole range; false with `why` when not. */
  counted: boolean;
  why?: string;
  severities: { severity: string; count: number }[];
  /** By service, when services are named by the labels Monitoring keeps, with its count per severity. */
  services?: {
    project: string;
    name: string;
    kind: string;
    count: number;
    severities: Record<string, number>;
  }[];
  series: { start: string; count: number; errors: number }[];
  stepMs: number;
  warnings: CloudWarning[];
};

const METRIC = 'logging.googleapis.com/log_entry_count';
/** Bar widths for the series, in seconds: the first giving at most 60 bars over the range. */
const STEPS = [60, 300, 600, 1800, 3600, 10_800];
const ERROR_RANK = severityRank('ERROR');

const notCounted = (why: string, warnings: CloudWarning[] = []): CloudVolume => ({
  counted: false,
  why,
  severities: [],
  series: [],
  stepMs: 0,
  warnings,
});

type Series = {
  metric?: { labels?: Record<string, string> };
  resource?: { type?: string; labels?: Record<string, string> };
  points?: { interval?: { startTime?: string }; value?: { int64Value?: string } }[];
};

/** The Monitoring filter for `query` in one project, or why it cannot be one. */
function filterFor(config: GcpLogs, query: CloudQuery, names: readonly string[] | undefined) {
  if (query.text || query.trace || Object.keys(query.fields ?? {}).length)
    return {
      why: 'the query searches text, a trace or fields, which Cloud Monitoring does not count',
    };
  const env = envOf(config, query.env);
  const envFilter = env ? monitoringFilter(config.envs[env] ?? '') : { filter: '' };
  if ('unmapped' in envFilter)
    return {
      why: `${envFilter.unmapped} in the env ${env}'s filter cannot be counted by Cloud Monitoring`,
    };
  const own = query.filter ? monitoringFilter(query.filter) : { filter: '' };
  if ('unmapped' in own) return { why: `${own.unmapped} cannot be counted by Cloud Monitoring` };
  if (names?.length && config.service)
    return {
      why: `services are named by ${config.service}, a label Cloud Monitoring does not keep`,
    };
  const quotedNames = (names ?? []).map((n) => JSON.stringify(n)).join(', ');
  const service = names?.length
    ? `(${SERVICE_LABELS.map(([path]) => `${path} = one_of(${quotedNames})`).join(' OR ')})`
    : '';
  const severity = query.severity
    ? `metric.labels.severity = one_of(${SEVERITIES.slice(
        0,
        severityRank(query.severity.toUpperCase()) + 1,
      )
        .map((s) => JSON.stringify(s))
        .join(', ')})`
    : '';
  return {
    filter: [
      `metric.type = "${METRIC}"`,
      ...[envFilter.filter, own.filter, service, severity].filter(Boolean).map((f) => `(${f})`),
      ...(query.all ? [] : [OWN_SERVICES_MONITORING]),
    ].join(' AND '),
  };
}

/** `query`'s entries over its range across the GCP projects, by severity, service and time. */
export async function cloudVolume(
  deps: ErrorDeps,
  config: GcpLogs,
  query: CloudQuery,
): Promise<CloudVolume> {
  const now = deps.now();
  const start = sinceTime(query.since ?? '1h', now);
  const rangeS = Math.max(60, Math.round((now.getTime() - Date.parse(start)) / 1000));
  const step = STEPS.find((s) => rangeS / s <= 60) ?? (STEPS.at(-1) as number);
  const picked = servicesByProject(config, query.services);
  const projects = Object.keys(cloudFilters(config, query, now));
  const filters = projects.map((p) => ({
    project: p,
    ...filterFor(config, query, picked?.get(p)),
  }));
  const unfit = filters.find((f) => 'why' in f && f.why);
  if (unfit && 'why' in unfit && unfit.why) return notCounted(unfit.why);
  const token = await accessToken(deps.run);
  const { done, warnings } = await eachProject(projects, async (project) => {
    const filter = filters.find((f) => f.project === project);
    const params = new URLSearchParams({
      filter: filter && 'filter' in filter ? (filter.filter ?? '') : '',
      'interval.startTime': start,
      'interval.endTime': now.toISOString(),
      'aggregation.alignmentPeriod': `${step}s`,
      'aggregation.perSeriesAligner': 'ALIGN_DELTA',
      'aggregation.crossSeriesReducer': 'REDUCE_SUM',
    });
    for (const field of [
      'metric.label.severity',
      'resource.type',
      ...SERVICE_LABELS.map(([path]) => path.replace('resource.labels.', 'resource.label.')),
    ])
      params.append('aggregation.groupByFields', field);
    const body = await googleGet(
      deps.run,
      deps.http,
      project,
      `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(project)}/timeSeries?${params}`,
      token,
    );
    return (body.timeSeries ?? []) as Series[];
  });
  if (!done.length)
    return notCounted(warnings[0]?.message ?? 'Cloud Monitoring answered nothing', warnings);
  const bySeverity = new Map<string, number>();
  const byService = new Map<string, NonNullable<CloudVolume['services']>[number]>();
  const byTime = new Map<string, { count: number; errors: number }>();
  for (const { project, value } of done)
    for (const series of value) {
      const severity = series.metric?.labels?.severity ?? 'DEFAULT';
      const kind = SERVICE_LABELS.find(([, type]) => type === series.resource?.type);
      const name = kind
        ? series.resource?.labels?.[kind[0].replace('resource.labels.', '')]
        : undefined;
      for (const point of series.points ?? []) {
        const count = Number(point.value?.int64Value ?? 0);
        if (!count) continue;
        bySeverity.set(severity, (bySeverity.get(severity) ?? 0) + count);
        if (kind && name) {
          const key = `${project}/${name}`;
          const row = byService.get(key) ?? {
            project,
            name,
            kind: kind[2],
            count: 0,
            severities: {},
          };
          row.count += count;
          row.severities[severity] = (row.severities[severity] ?? 0) + count;
          byService.set(key, row);
        }
        const at = point.interval?.startTime ?? '';
        const bucket = byTime.get(at) ?? { count: 0, errors: 0 };
        bucket.count += count;
        if (severityRank(severity) <= ERROR_RANK) bucket.errors += count;
        byTime.set(at, bucket);
      }
    }
  return {
    counted: true,
    severities: [...bySeverity]
      .map(([severity, count]) => ({ severity, count }))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)),
    ...(config.service
      ? {}
      : { services: [...byService.values()].sort((a, b) => b.count - a.count) }),
    series: [...byTime]
      .map(([at, bucket]) => ({ start: at, ...bucket }))
      .sort((a, b) => a.start.localeCompare(b.start)),
    stepMs: step * 1000,
    warnings,
  };
}
