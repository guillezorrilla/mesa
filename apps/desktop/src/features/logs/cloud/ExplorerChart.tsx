import type { CloudLogEntry } from '@mesa/core';
import type { CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';
import { CloudLogsChart } from './CloudLogsChart';
import { CLOUD_RANGES, type CloudRange } from './cloudLines';

/** The chart from a log-based metric's counts (Cloud Monitoring), summed across the view's projects. */
function MeteredChart(props: {
  entries: readonly CloudLogEntry[];
  rangeMs: number;
  projects: string[];
  metric: string;
  since?: string;
}) {
  const counts = useOptional('logs.counts', {
    projects: props.projects,
    metric: props.metric,
    since: props.since,
  });
  return (
    <CloudLogsChart entries={props.entries} rangeMs={props.rangeMs} counts={counts.data?.counts} />
  );
}

/** The Explorer's histogram: a view's metric counts when it maps to one, else the entries read. */
export function ExplorerChart(props: { entries: readonly CloudLogEntry[]; filters: CloudFilters }) {
  const range = CLOUD_RANGES[(props.filters.since ?? '1h') as CloudRange]?.[1] ?? 3_600_000;
  const { metric, projects, since } = props.filters;
  return metric && projects?.length ? (
    <MeteredChart
      entries={props.entries}
      rangeMs={range}
      projects={projects}
      metric={metric}
      since={since}
    />
  ) : (
    <CloudLogsChart entries={props.entries} rangeMs={range} />
  );
}
