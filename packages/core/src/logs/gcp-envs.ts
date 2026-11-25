import type { Runner } from '../lib/process.js';
import { ENV_WORDS, envNameOf } from './env-names.js';
import { quoted } from './filter-text.js';
import { gcloud, jsonList } from './gcloud.js';

// The envs the Cloud Logs setup suggests for the GCP projects picked (CONTEXT.md, Cloud Logs).

/** An env the setup offers: its guessed name, the Logging filter it stands for, and why. */
export type EnvSuggestion = { name: string; filter: string; from: string };

/** The env suffixes a Cloud Run service name can end in (`checkout-beta`). */
const RUN_SUFFIXES = ENV_WORDS.filter((word) => word !== 'prod');
const RUN = 'resource.type="cloud_run_revision"';

/** The names one gcloud listing in `project` gives; none when it fails (an API off, no role). */
async function names(
  run: Runner,
  project: string,
  args: string[],
  name: (row: Record<string, unknown>) => unknown,
) {
  const rows = await gcloud(run, project, [...args, '--project', project])
    .then(jsonList)
    .catch(() => []);
  return rows.map(name).filter((value): value is string => typeof value === 'string' && !!value);
}

/**
 * One env per GKE cluster of `projects`, named from the cluster's name (envNameOf), and, when
 * their Cloud Run services end in an env suffix, one env per suffix plus prod for the rest.
 */
export async function envSuggestions(run: Runner, projects: readonly string[]) {
  const reads = await Promise.all(
    projects.map(async (project) => {
      const [clusters, services] = await Promise.all([
        names(
          run,
          project,
          ['container', 'clusters', 'list', '--format', 'json(name)'],
          (row) => row.name,
        ),
        names(
          run,
          project,
          ['run', 'services', 'list', '--format', 'json(metadata.name)'],
          (row) => (row.metadata as { name?: unknown } | undefined)?.name,
        ),
      ]);
      return { clusters, services };
    }),
  );
  const clusters = [...new Set(reads.flatMap((read) => read.clusters))].sort();
  const services = reads.flatMap((read) => read.services);
  const suffixes = RUN_SUFFIXES.filter((suffix) => services.some((s) => s.endsWith(`-${suffix}`)));
  const suggestions: EnvSuggestion[] = [
    ...clusters.map((cluster) => ({
      name: envNameOf(cluster),
      filter: `resource.labels.cluster_name=${quoted(cluster)}`,
      from: `GKE cluster ${cluster}`,
    })),
    ...suffixes.map((suffix) => ({
      name: suffix,
      filter: `${RUN} AND resource.labels.service_name=~"-${suffix}$"`,
      from: `Cloud Run services ending -${suffix}`,
    })),
    ...(suffixes.length
      ? [
          {
            name: 'prod',
            filter: `${RUN} AND NOT resource.labels.service_name=~"-(${suffixes.join('|')})$"`,
            from: 'Cloud Run services with no env suffix',
          },
        ]
      : []),
  ];
  return { suggestions };
}
