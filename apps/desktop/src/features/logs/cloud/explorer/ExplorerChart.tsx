import type { CloudDeploy, CloudLogEntry, CloudVolume } from '@mesa/core';
import type { CloudFilters } from '@/lib/client/logs';
import { useOptional } from '@/lib/useCommand';
import { CloudLogsChart } from './CloudLogsChart';

/** The chart from a log-based metric's counts (Cloud Monitoring), summed across the view's projects. */
function MeteredChart(props: {
  entries: readonly CloudLogEntry[];
  projects: string[];
  metric: string;
  since?: string;
  deploys?: readonly CloudDeploy[];
}) {
  const counts = useOptional('logs.counts', {
    projects: props.projects,
    metric: props.metric,
    since: props.since,
  });
  return (
    <CloudLogsChart entries={props.entries} counts={counts.data?.counts} deploys={props.deploys} />
  );
}

/**
 * The Explorer's histogram: a view's metric counts over the range when it maps to one, else the
 * range's log entry counts from Cloud Monitoring when the query allows them (`volume`), else the
 * entries read over the span they cover, with Load older (`onOlder`); each with the range's deploys.
 */
export function ExplorerChart(props: {
  entries: readonly CloudLogEntry[];
  filters: CloudFilters;
  onOlder?: () => void;
  olderBusy?: boolean;
  volume?: CloudVolume;
  deploys?: readonly CloudDeploy[];
}) {
  const { metric, projects, since } = props.filters;
  return metric && projects?.length ? (
    <MeteredChart
      entries={props.entries}
      projects={projects}
      metric={metric}
      since={since}
      deploys={props.deploys}
    />
  ) : props.volume?.counted && props.volume.series.length ? (
    <CloudLogsChart
      entries={props.entries}
      counts={props.volume.series}
      stepMs={props.volume.stepMs}
      counter="volume"
      deploys={props.deploys}
    />
  ) : (
    <CloudLogsChart
      entries={props.entries}
      onOlder={props.onOlder}
      olderBusy={props.olderBusy}
      deploys={props.deploys}
    />
  );
}
