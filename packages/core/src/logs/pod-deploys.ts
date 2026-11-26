import { valueAt } from '../lib/yaml-file.js';
import { serviceRefOf } from './cloud-entry.js';
import type { CloudDeploy } from './deploys.js';
import { gcloud, jsonList, warningOf } from './gcloud.js';
import {
  CLOUD_MAX_LIMIT,
  type CloudDeps,
  type CloudQuery,
  cloudEntry,
  cloudFilters,
} from './gcp.js';
import type { GcpLogs } from './gcp-config.js';

// GKE deploys from the entries (CONTEXT.md, Cloud Logs, Deploys): GKE lists no revisions, so a
// workload's deploy is the first entry of a pod template hash after it had logged under others.
// A workload is its cluster, namespace and controller, since one container name runs in several.

/** A GKE entry's pod template: its service, the workload it runs in, its hash and time. */
export type PodTemplate = {
  project: string;
  service: string;
  workload: string;
  revision: string;
  time: string;
};

/**
 * How long a workload must have logged under other hashes before a new one counts as its deploy:
 * a page that starts inside a rollout, or a busy minute where two hashes log side by side, gives none.
 */
const LEAD_MS = 5 * 60_000;

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

/** `raw`'s pod template, when it is a GKE container's entry with one; undefined otherwise. */
export function podTemplateOf(
  raw: Record<string, unknown>,
  project: string,
  service: string | null,
) {
  const labels = raw.labels as Record<string, unknown> | undefined;
  const revision = text(labels?.['k8s-pod/pod-template-hash']);
  if (valueAt(raw, 'resource.type') !== 'k8s_container' || !service || !revision) return undefined;
  const workload = [
    text(valueAt(raw, 'resource.labels.cluster_name')),
    text(valueAt(raw, 'resource.labels.namespace_name')),
    text(labels?.['logging.gke.io/top_level_controller_name']) ?? service,
  ].join('/');
  return { project, service, workload, revision, time: String(raw.timestamp ?? '') };
}

/** The deploys `pods` show: each workload's first entry of a new hash, LEAD_MS after it first logged. */
export function podDeploys(pods: readonly PodTemplate[]): CloudDeploy[] {
  const seen = new Map<string, { since: number; hashes: Set<string> }>();
  const found: CloudDeploy[] = [];
  for (const pod of [...pods].sort((a, b) => Date.parse(a.time) - Date.parse(b.time))) {
    const at = Date.parse(pod.time);
    const key = `${pod.project}/${pod.workload}`;
    const known = seen.get(key);
    if (!known) seen.set(key, { since: at, hashes: new Set([pod.revision]) });
    else if (!known.hashes.has(pod.revision)) {
      known.hashes.add(pod.revision);
      if (at - known.since >= LEAD_MS)
        found.push({
          project: pod.project,
          service: pod.service,
          revision: pod.revision,
          at: pod.time,
          source: 'logs',
        });
    }
  }
  return found;
}

/**
 * The newest CLOUD_MAX_LIMIT entries `query` picks in each project: the services they name (the
 * services shown when none are picked) and the GKE deploys they show, with a note for each project
 * that could not be read.
 */
export async function entryDeploys(deps: CloudDeps, config: GcpLogs, query: CloudQuery) {
  const filters = cloudFilters(config, query, deps.now());
  const read = await Promise.all(
    Object.entries(filters).map(async ([project, filter]) => {
      try {
        const raws = jsonList(
          await gcloud(deps.run, project, [
            'logging',
            'read',
            filter,
            `--project=${project}`,
            '--format',
            'json',
            '--limit',
            String(CLOUD_MAX_LIMIT),
          ]),
        );
        const entries = raws.map((raw) => ({ raw, entry: cloudEntry(raw, config, project) }));
        return {
          services: entries.flatMap(({ entry }) => (entry.service ? [serviceRefOf(entry)] : [])),
          pods: entries.flatMap(
            ({ raw, entry }) => podTemplateOf(raw, project, entry.service) ?? [],
          ),
          notes: [],
        };
      } catch (error) {
        const note = warningOf(project, error);
        return {
          services: [],
          pods: [],
          notes: [{ ...note, message: `the entries: ${note.message}` }],
        };
      }
    }),
  );
  return {
    services: new Set(read.flatMap((r) => r.services)),
    deploys: podDeploys(read.flatMap((r) => r.pods)),
    notes: read.flatMap((r) => r.notes),
  };
}
