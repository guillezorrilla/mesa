import type { LockDeps } from '../lib/lock-file.js';
import { serviceRefOf } from './cloud-entry.js';
import { cachedDeploys } from './deploy-cache.js';
import { listedDeploys } from './deploy-sources.js';
import type { CloudWarning } from './gcloud.js';
import { type CloudDeps, type CloudQuery, cloudFilters, servicesByProject } from './gcp.js';
import type { GcpLogs } from './gcp-config.js';
import { entryDeploys } from './pod-deploys.js';
import { sinceTime } from './since.js';

// Deploys (CONTEXT.md, Cloud Logs): when each service shown got a new revision over a range, so a
// chart, an error group and Ask can say "did the deploy break it?". Cloud Run and App Engine list
// theirs (deploy-sources.ts); a GKE service's come from its entries (pod-deploys.ts).

/** A deploy: a new revision of `project`'s `service` at `at`, and who said so. */
export type CloudDeploy = {
  project: string;
  service: string;
  revision: string;
  at: string;
  /** Cloud Run's revisions, App Engine's versions, or a new GKE pod template first seen in the entries. */
  source: 'cloud-run' | 'app-engine' | 'logs';
};

/** The deploys of a range, oldest first, and a note for each source that could not be read. */
export type CloudDeploys = { deploys: CloudDeploy[]; notes: CloudWarning[] };

/** What picks the deploys: the env, projects and services shown, and the range. */
export type DeployQuery = Pick<CloudQuery, 'env' | 'projects' | 'services' | 'since'>;

/** `query`'s deploys, read afresh: each project's listings and the range's entries at once. */
async function readDeploys(
  deps: CloudDeps,
  config: GcpLogs,
  query: DeployQuery,
): Promise<CloudDeploys> {
  const now = deps.now();
  const from = Date.parse(sinceTime(query.since ?? '1h', now));
  const picked = servicesByProject(config, query.services);
  const projects = Object.keys(cloudFilters(config, query, now));
  const [entries, ...lists] = await Promise.all([
    entryDeploys(deps, config, query),
    ...projects.map((project) => listedDeploys(deps, project, new Date(from).toISOString())),
  ]);
  const shown = (deploy: CloudDeploy) =>
    picked
      ? Boolean(picked.get(deploy.project)?.includes(deploy.service))
      : entries.services.has(serviceRefOf(deploy));
  const inRange = (deploy: CloudDeploy) => {
    const at = Date.parse(deploy.at);
    return at >= from && at <= now.getTime();
  };
  return {
    deploys: [...entries.deploys, ...lists.flatMap((l) => l.deploys)]
      .filter((d) => inRange(d) && shown(d))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    notes: [...entries.notes, ...lists.flatMap((l) => l.notes)],
  };
}

/**
 * Each deploy of the services `query` shows over its range across the GCP projects: Cloud Run's
 * revisions, App Engine's versions and, for GKE, a workload's new pod template first seen in the
 * range's newest entries. The services shown are the picked ones, else those the entries name. A
 * source that fails is a note, never an error. With `cache`, a range is reused for two minutes
 * (one when it has notes), kept by its env, projects, services and `since`.
 */
export function cloudDeploys(
  deps: CloudDeps,
  config: GcpLogs,
  query: DeployQuery,
  cache?: { file: string; lock: LockDeps },
): Promise<CloudDeploys> {
  const key = JSON.stringify([
    query.env ?? null,
    [...(query.projects ?? [])].sort(),
    [...(query.services ?? [])].sort(),
    query.since ?? '1h',
  ]);
  return cachedDeploys(cache, key, deps.now().getTime(), () => readDeploys(deps, config, query));
}
