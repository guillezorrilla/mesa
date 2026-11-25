import type { Runner } from '../lib/process.js';
import type { ErrorDeps } from './errors.js';
import { eachProject, gcloud, googleGet, jsonList } from './gcloud.js';
import { quoted } from './gcp.js';
import type { CloudView } from './gcp-config.js';
import { sinceTime } from './since.js';

// Log-based metrics (CONTEXT.md, Cloud Logs): each becomes a saved view with its filter, and a
// view that maps to one gets its counts over time from Cloud Monitoring, not from a page read.

/** Each log-based metric of GCP `project` as a view: its name, filter, project and metric. */
export async function metricViews(run: Runner, project: string): Promise<CloudView[]> {
  const out = await gcloud(run, project, [
    'logging',
    'metrics',
    'list',
    '--project',
    project,
    '--format',
    'json(name,filter)',
  ]);
  return jsonList(out)
    .filter((row) => typeof row.name === 'string' && typeof row.filter === 'string' && row.filter)
    .map((row) => ({
      name: String(row.name).slice(0, 60),
      filter: String(row.filter),
      projects: [project],
      metric: String(row.name),
    }));
}

/** A count per 5 minutes. */
export type CloudCount = { start: string; count: number };

/**
 * Log-based metric `metric`'s count per 5 minutes since `since` across `projects` (a view can
 * span several): each project's from Cloud Monitoring at once, summed by time, and a warning for
 * each that could not be read.
 */
export async function metricCounts(
  deps: ErrorDeps,
  projects: readonly string[],
  metric: string,
  since: string,
) {
  const { done, warnings } = await eachProject(projects, (project) =>
    projectCounts(deps, project, metric, since),
  );
  const sums = new Map<string, number>();
  for (const { value } of done)
    for (const point of value) sums.set(point.start, (sums.get(point.start) ?? 0) + point.count);
  const counts = [...sums.entries()]
    .map(([start, count]) => ({ start, count }))
    .sort((a, b) => a.start.localeCompare(b.start));
  return { counts, warnings };
}

/** One project's counts of `metric` per 5 minutes since `since`. */
async function projectCounts(deps: ErrorDeps, project: string, metric: string, since: string) {
  const end = deps.now().toISOString();
  const start = sinceTime(since, deps.now());
  const query = new URLSearchParams({
    filter: `metric.type=${quoted(`logging.googleapis.com/user/${metric}`)}`,
    'interval.startTime': start,
    'interval.endTime': end,
    'aggregation.alignmentPeriod': '300s',
    'aggregation.perSeriesAligner': 'ALIGN_DELTA',
    'aggregation.crossSeriesReducer': 'REDUCE_SUM',
  });
  const body = await googleGet(
    deps.run,
    deps.http,
    project,
    `https://monitoring.googleapis.com/v3/projects/${encodeURIComponent(project)}/timeSeries?${query}`,
  );
  const series = (body.timeSeries ?? []) as {
    points?: {
      interval?: { startTime?: string; endTime?: string };
      value?: { int64Value?: string; doubleValue?: number };
    }[];
  }[];
  return (series[0]?.points ?? [])
    .map((point) => ({
      start: point.interval?.startTime ?? point.interval?.endTime ?? '',
      count: Number(point.value?.int64Value ?? point.value?.doubleValue ?? 0),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
}
