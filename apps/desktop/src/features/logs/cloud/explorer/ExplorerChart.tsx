import type { CloudLogEntry } from '@mesa/core';
import type { CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';
import { CloudLogsChart } from './CloudLogsChart';

/** The chart from a log-based metric's counts (Cloud Monitoring), summed across the view's projects. */
function MeteredChart(props: {
  entries: readonly CloudLogEntry[];
  projects: string[];
  metric: string;
  since?: string;
}) {
  const counts = useOptional('logs.counts', {
    projects: props.projects,
    metric: props.metric,
    since: props.since,
  });
  return <CloudLogsChart entries={props.entries} counts={counts.data?.counts} />;
}

/**
 * The Explorer's histogram: a view's metric counts over the range when it maps to one, else the
 * entries read over the span they cover, with Load older (`onOlder`).
 */
export function ExplorerChart(props: {
  entries: readonly CloudLogEntry[];
  filters: CloudFilters;
  onOlder?: () => void;
  olderBusy?: boolean;
}) {
  const { metric, projects, since } = props.filters;
  return metric && projects?.length ? (
    <MeteredChart entries={props.entries} projects={projects} metric={metric} since={since} />
  ) : (
    <CloudLogsChart entries={props.entries} onOlder={props.onOlder} olderBusy={props.olderBusy} />
  );
}
