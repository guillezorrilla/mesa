import { z } from 'zod';
import { changeJson, readCache } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import type { MesaError } from '../lib/result.js';
import { serviceRefOf } from './cloud-entry.js';
import { type CloudWarning, GCLOUD_TIMEOUT_MS, gcloudError, jsonList } from './gcloud.js';
import {
  CLOUD_MAX_LIMIT,
  type CloudDeps,
  type CloudLogEntry,
  type CloudQuery,
  cloudFilters,
  cloudLogs,
  servicesByProject,
} from './gcp.js';
import type { GcpLogs } from './gcp-config.js';
import { sinceTime } from './since.js';

// Deploys (CONTEXT.md, Cloud Logs): when each service shown got a new revision over a range, so a
// chart, an error group and Ask can say "did the deploy break it?". Cloud Run lists its revisions
// and App Engine its versions with their creation times; GKE has no such list, so a GKE service's
// deploy is the first entry of a pod template hash it had not logged before.

/** A deploy: a new revision of `project`'s `service` at `at`, and who said so. */
export type CloudDeploy = {
  project: string;
  service: string;
  revision: string;
  at: string;
  /** Cloud Run's revisions, App Engine's versions, or a new revision first seen in the entries. */
  source: 'cloud-run' | 'app-engine' | 'logs';
};

/** The deploys of a range, oldest first, and a note for each source that could not be read. */
export type CloudDeploys = { deploys: CloudDeploy[]; notes: CloudWarning[] };

/** What picks the deploys: the env, projects and services shown, and the range. */
export type DeployQuery = Pick<CloudQuery, 'env' | 'projects' | 'services' | 'since'>;

const DeploySchema = z.strictObject({
  project: z.string(),
  service: z.string(),
  revision: z.string(),
  at: z.string(),
  source: z.enum(['cloud-run', 'app-engine', 'logs']),
});
const Cache = z
  .record(z.string(), z.strictObject({ at: z.string(), deploys: z.array(DeploySchema) }))
  .describe('Cloud Logs deploys');

/** How long a range's deploys are reused: a chart redrawn or Ask asked again reads none afresh. */
const FRESH_MS = 2 * 60_000;

/** A source gcloud says this project does not use (no App Engine app, the Cloud Run API off): no deploys, no note. */
const NOT_USED =
  /does not contain an App Engine application|Apps instance .* not found|run\.googleapis\.com|has not been used in project|SERVICE_DISABLED/i;

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
const objectAt = (row: Row | undefined, key: string) => row?.[key] as Row | undefined;

/** Each listing source: its gcloud argv for a project, and a row read as a service, revision and time. */
const SOURCES = [
  [
    'cloud-run',
    'Cloud Run revisions',
    (p: string) => ['run', 'revisions', 'list', '--project', p, '--format', 'json'],
    (row: Row) => {
      const meta = objectAt(row, 'metadata');
      return {
        service: text(objectAt(meta, 'labels')?.['serving.knative.dev/service']),
        revision: text(meta?.name),
        at: text(meta?.creationTimestamp),
      };
    },
  ],
  [
    'app-engine',
    'App Engine versions',
    (p: string) => ['app', 'versions', 'list', '--project', p, '--format', 'json'],
    (row: Row) => ({
      service: text(row.service),
      revision: text(row.id),
      at:
        text(objectAt(row, 'version')?.createTime) ??
        text(objectAt(row, 'last_deployed_time')?.datetime),
    }),
  ],
] as const;

/** A source's rows in `project`; none when the project does not use it, a gcloudError for any other failure. */
async function listed(deps: CloudDeps, project: string, argv: string[]): Promise<Row[]> {
  const read = await deps.run('gcloud', argv, GCLOUD_TIMEOUT_MS);
  if (read.ok) return jsonList(read.stdout);
  if (read.reason === 'failed' && NOT_USED.test(read.output || read.detail)) return [];
  throw gcloudError(read, project);
}

/**
 * The deploys `entries` show: for each service, the first entry of each revision after the first
 * revision it logged (whose deploy, if any, was before the entries). Services `skip` names, which
 * a listing already covers, are left out.
 */
export function entryDeploys(
  entries: readonly CloudLogEntry[],
  skip: (ref: string) => boolean = () => false,
): CloudDeploy[] {
  const seen = new Map<string, Set<string>>();
  const found: CloudDeploy[] = [];
  const oldestFirst = [...entries].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  for (const entry of oldestFirst) {
    const revision = entry.fields.revision;
    if (!revision || !entry.service) continue;
    const ref = serviceRefOf(entry);
    if (skip(ref)) continue;
    const known = seen.get(ref);
    if (!known) seen.set(ref, new Set([revision]));
    else if (!known.has(revision)) {
      known.add(revision);
      found.push({
        project: entry.project,
        service: entry.service,
        revision,
        at: entry.time,
        source: 'logs',
      });
    }
  }
  return found;
}

/** A source's or the entries' failure as a note naming what could not be read. */
const noteOf = (project: string, what: string, error: unknown): CloudWarning => {
  const details = (error as MesaError).details as Pick<CloudWarning, 'fix' | 'action'> | undefined;
  return {
    project,
    message: `${what}: ${error instanceof Error ? error.message : String(error)}`,
    ...(details?.fix ? { fix: details.fix } : {}),
    ...(details?.action ? { action: details.action } : {}),
  };
};

/** `query`'s deploys, read afresh: the listings and the entries of each project, merged. */
async function readDeploys(
  deps: CloudDeps,
  config: GcpLogs,
  query: DeployQuery,
): Promise<CloudDeploys> {
  const now = deps.now();
  const from = Date.parse(sinceTime(query.since ?? '1h', now));
  const picked = servicesByProject(config, query.services);
  const notes: CloudWarning[] = [];
  const projects = Object.keys(cloudFilters(config, query, now));
  // The entries give the services shown (when none are picked) and the GKE deploys; the
  // listings need only the projects, so both are read at once.
  const [read, lists] = await Promise.all([
    cloudLogs(deps, config, { ...query, limit: CLOUD_MAX_LIMIT }).catch((error) => {
      notes.push(noteOf(projects.join(', '), 'the entries', error));
      return undefined;
    }),
    Promise.all(
      projects.flatMap((project) =>
        SOURCES.map(async ([source, what, argv, rowOf]) => {
          try {
            return (await listed(deps, project, argv(project)))
              .map(rowOf)
              .flatMap((row) =>
                row.service && row.revision && row.at
                  ? [{ project, source, ...row } as CloudDeploy]
                  : [],
              );
          } catch (error) {
            notes.push(noteOf(project, what, error));
            return [];
          }
        }),
      ),
    ),
  ]);
  notes.push(
    ...(read?.warnings ?? []).map((w) => ({ ...w, message: `the entries: ${w.message}` })),
  );
  const entries = read?.entries ?? [];
  const logged = new Set(entries.flatMap((e) => (e.service ? [serviceRefOf(e)] : [])));
  const shown = (deploy: CloudDeploy) =>
    picked
      ? Boolean(picked.get(deploy.project)?.includes(deploy.service))
      : logged.has(serviceRefOf(deploy));
  const listedDeploys = lists.flat();
  // A service a listing names is its listing's, so traffic split over old revisions is no deploy.
  const covered = new Set(listedDeploys.map(serviceRefOf));
  const byKey = new Map<string, CloudDeploy>();
  for (const deploy of [...entryDeploys(entries, (ref) => covered.has(ref)), ...listedDeploys]) {
    const at = Date.parse(deploy.at);
    if (at >= from && at <= now.getTime() && shown(deploy))
      byKey.set(`${serviceRefOf(deploy)}/${deploy.revision}`, deploy);
  }
  return {
    deploys: [...byKey.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    notes,
  };
}

/**
 * Each deploy of the services `query` shows over its range across the GCP projects: Cloud Run's
 * revisions (`gcloud run revisions list`), App Engine's versions (`gcloud app versions list`) and,
 * for any other service such as a GKE one, a new revision first seen in the range's entries (their
 * newest CLOUD_MAX_LIMIT). The services shown are the picked ones, else those the entries name. A
 * source that fails is a note, never an error. With `cache`, a range read without notes is reused
 * for two minutes, kept by its env, projects, services and `since`.
 */
export async function cloudDeploys(
  deps: CloudDeps,
  config: GcpLogs,
  query: DeployQuery,
  cache?: { file: string; lock: LockDeps },
): Promise<CloudDeploys> {
  const now = deps.now().getTime();
  const key = JSON.stringify([
    query.env ?? null,
    [...(query.projects ?? [])].sort(),
    [...(query.services ?? [])].sort(),
    query.since ?? '1h',
  ]);
  const hit = cache ? readCache(cache.file, Cache, {})[key] : undefined;
  if (hit && now - Date.parse(hit.at) < FRESH_MS) return { deploys: hit.deploys, notes: [] };
  const found = await readDeploys(deps, config, query);
  if (cache && !found.notes.length)
    changeJson(
      cache.file,
      Cache,
      (current = {}) => ({
        // Only ranges still fresh are kept, so the file stays a handful of entries.
        ...Object.fromEntries(
          Object.entries(current).filter(([, c]) => now - Date.parse(c.at) < FRESH_MS),
        ),
        [key]: { at: new Date(now).toISOString(), deploys: found.deploys },
      }),
      cache.lock,
    );
  return found;
}
