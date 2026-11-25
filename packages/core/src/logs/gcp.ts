import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { valueAt } from '../lib/yaml-file.js';
import { eachProject, gcloud, jsonList } from './gcloud.js';
import { ALL_ENVS, type CloudSeverity, filterProblem, type GcpLogs } from './gcp-config.js';
import { OWN_SERVICES_FILTER } from './noise.js';
import { sinceTime } from './since.js';

export type { CloudWarning } from './gcloud.js';

// Cloud Logs (CONTEXT.md, Cloud Logs; ADR-0033): the profile's Google Cloud Logging entries, read
// with the person's own `gcloud`, an argv and never a shell, so Mesa holds no Google token. Each
// env is a Logging filter kept in the profile's config.yaml (gcp-config.ts).

export type CloudLogEntry = {
  /** The GCP project it was read from. */
  project: string;
  /** Its insertId, unique in the GCP project: what Ask cites. */
  id: string;
  time: string;
  /** As Logging gives it: `ERROR`, `WARNING`, `INFO`, `DEFAULT`, ... */
  severity: string;
  /** Its GKE container, Cloud Run service or App Engine module (or the configured label); null when none. */
  service: string | null;
  message: string;
  trace: string | null;
  /** Its JSON payload's top-level scalar context fields (a company, user, URI or status): facets. */
  fields: Record<string, string>;
};

export type CloudQuery = {
  /** One of the envs; the first when not given, none when there are none. */
  env?: string;
  /** Only these GCP projects of the configured ones; every one when none. */
  projects?: string[];
  /** Only these services, each `<project>/<name>`; every service of every project when none. */
  services?: string[];
  /** Only entries whose JSON payload field has this value, each `key` a facet. */
  fields?: Record<string, string>;
  /** A Logging filter of a person's own, such as a saved view's or a log-based metric's. */
  filter?: string;
  /** Load balancer, proxy, GKE system and audit entries too (noise.ts); left out by default. */
  all?: boolean;
  /** Only entries before this time: the next page back. */
  before?: string;
  /** Only entries of this trace id, in whichever project they are. */
  trace?: string;
  /** Entries at this severity or more severe. */
  severity?: CloudSeverity;
  /** Entries holding this text anywhere (Logging's global search). */
  text?: string;
  /** An ISO time or an age such as `30m`, `1h`, `1d`; `1h` when not given. */
  since?: string;
  /** The newest this many entries; 200 when not given, at most 1000. */
  limit?: number;
};

export type CloudDeps = { run: Runner; now: () => Date };

const DEFAULT_SINCE = '1h';
const DEFAULT_LIMIT = 200;
export const CLOUD_MAX_LIMIT = 1000;

/** Where each resource kind names its service, with the kind's label: GKE, Cloud Run, App Engine. */
export const SERVICE_LABELS = [
  ['resource.labels.container_name', 'k8s_container', 'GKE'],
  ['resource.labels.service_name', 'cloud_run_revision', 'Cloud Run'],
  ['resource.labels.module_id', 'gae_app', 'App Engine'],
] as const;

/** The label paths an entry's service is read from: the configured one, else each kind's. */
export const servicePaths = (config: GcpLogs) =>
  config.service ? [config.service] : SERVICE_LABELS.map(([path]) => path);

/** The env `env` names, else the first; undefined with none or for every env (ALL_ENVS); usage for one there is not. */
export function envOf(config: GcpLogs, env?: string): string | undefined {
  const names = Object.keys(config.envs);
  if (env === undefined) return names[0];
  if (env === ALL_ENVS) return undefined;
  if (!Object.hasOwn(config.envs, env))
    throw new MesaError('usage', `no env ${env} in logs.gcp.envs: ${names.join(', ') || 'none'}`);
  return env;
}

/** A Logging filter of a person's own, checked to be one expression (filterProblem). */
function checkedFilter(filter: string) {
  const problem = filterProblem(filter);
  if (problem) throw new MesaError('usage', `--filter must be one Logging filter: it ${problem}`);
  return filter;
}

/** A facet's JSON key, checked so it can sit in a filter unquoted. */
function fieldKey(key: string) {
  if (!FIELD_KEY.test(key))
    throw new MesaError('usage', `${key} is not a field name a filter can use`);
  return key;
}
const FIELD_KEY = /^[A-Za-z_]\w{0,63}$/;
/** Payload keys that are the entry itself, not context. */
const NOT_FIELDS = new Set([
  'message',
  'msg',
  'stack_trace',
  'stackTrace',
  'exception',
  'severity',
  'level',
  'time',
  'timestamp',
]);

/** `json`'s top-level scalar values a filter can name, at most 20, each cut to 200 characters. */
function fieldsOf(json: Record<string, unknown> | undefined): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(json ?? {})) {
    if (Object.keys(fields).length >= 20) break;
    if (NOT_FIELDS.has(key) || !FIELD_KEY.test(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
      fields[key] = String(value).slice(0, 200);
  }
  return fields;
}

/** The revision or deploy an entry came from (Cloud Run, App Engine, a GKE pod template), as a field. */
function revisionOf(raw: Record<string, unknown>): { revision?: string } {
  const labels = raw.labels as Record<string, unknown> | undefined;
  const found = [
    valueAt(raw, 'resource.labels.revision_name'),
    valueAt(raw, 'resource.labels.version_id'),
    labels?.['k8s-pod/pod-template-hash'],
  ].find((value) => typeof value === 'string' && value);
  return typeof found === 'string' ? { revision: found.slice(0, 200) } : {};
}

/** `value` inside a Logging filter's double quotes. */
export const quoted = (value: string) =>
  `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/**
 * The Logging filter for `query` in one project: its env's filter, then `names` (that project's
 * picked services) under each kind's label, severity, trace, text and time.
 */
export function cloudFilter(
  config: GcpLogs,
  query: CloudQuery,
  now: Date,
  names: readonly string[] = [],
): string {
  const env = envOf(config, query.env);
  const service = names.flatMap((name) =>
    servicePaths(config).map((path) => `${path}=${quoted(name)}`),
  );
  return [
    ...(env ? [`(${config.envs[env]})`] : []),
    ...(service.length > 1 ? [`(${service.join(' OR ')})`] : service),
    ...(query.severity ? [`severity>=${query.severity.toUpperCase()}`] : []),
    // `:` is Logging's has: a trace field is projects/<id>/traces/<trace>, in any project.
    ...(query.trace ? [`trace:${quoted(query.trace)}`] : []),
    ...Object.entries(query.fields ?? {}).map(
      ([key, value]) => `jsonPayload.${fieldKey(key)}=${quoted(value)}`,
    ),
    ...(query.filter ? [`(${checkedFilter(query.filter)})`] : []),
    ...(query.text ? [quoted(query.text)] : []),
    ...(query.all ? [] : [OWN_SERVICES_FILTER]),
    `timestamp>=${quoted(sinceTime(query.since ?? DEFAULT_SINCE, now))}`,
    ...(query.before ? [`timestamp<${quoted(sinceTime(query.before, now))}`] : []),
  ].join(' AND ');
}

/** One entry as gcloud prints it, read: its message from jsonPayload.message, else textPayload, else the payload's JSON. */
export function cloudEntry(
  raw: Record<string, unknown>,
  config: GcpLogs,
  project: string,
): CloudLogEntry {
  const json = raw.jsonPayload as Record<string, unknown> | undefined;
  const service = servicePaths(config)
    .map((path) => valueAt(raw, path))
    .find((value) => typeof value === 'string' && value);
  return {
    project,
    id: String(raw.insertId ?? ''),
    time: String(raw.timestamp ?? ''),
    severity: String(raw.severity ?? 'DEFAULT'),
    service: typeof service === 'string' ? service : null,
    message:
      typeof json?.message === 'string'
        ? json.message
        : typeof raw.textPayload === 'string'
          ? raw.textPayload
          : JSON.stringify(json ?? raw.protoPayload ?? {}),
    trace: typeof raw.trace === 'string' ? raw.trace : null,
    fields: { ...fieldsOf(json), ...revisionOf(raw) },
  };
}

/** `project`, checked to be one of logs.gcp.projects; usage naming them when it is not. */
function knownProject(config: GcpLogs, project: string) {
  if (!config.projects.includes(project))
    throw new MesaError(
      'usage',
      `no GCP project ${project} in logs.gcp.projects: ${config.projects.join(', ')}`,
    );
}

/** The picked services by project, checked against the projects there are; undefined for all. */
export function servicesByProject(config: GcpLogs, refs: readonly string[] = []) {
  if (!refs.length) return undefined;
  const by = new Map<string, string[]>();
  for (const ref of refs) {
    const at = ref.indexOf('/');
    const project = ref.slice(0, at);
    if (at < 1 || at === ref.length - 1)
      throw new MesaError('usage', `--service must be <project>/<name>, not ${ref}`);
    knownProject(config, project);
    by.set(project, [...(by.get(project) ?? []), ref.slice(at + 1)]);
  }
  return by;
}

/**
 * The filter each GCP project `query` reads gets, by project: only the projects its services or
 * projects name, each with its own picked services.
 */
export function cloudFilters(config: GcpLogs, query: CloudQuery, now: Date) {
  const picked = servicesByProject(config, query.services);
  for (const project of query.projects ?? []) knownProject(config, project);
  const filters: Record<string, string> = {};
  for (const p of config.projects)
    if ((!picked || picked.has(p)) && (!query.projects?.length || query.projects.includes(p)))
      filters[p] = cloudFilter(config, query, now, picked?.get(p));
  return filters;
}

/**
 * The newest entries `query` picks across the GCP projects, read in parallel and merged newest
 * first, each project's filter, and a warning for each project that failed.
 */
export async function cloudLogs(deps: CloudDeps, config: GcpLogs, query: CloudQuery) {
  const limit = query.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > CLOUD_MAX_LIMIT)
    throw new MesaError('usage', `--limit must be 1 to ${CLOUD_MAX_LIMIT}, not ${limit}`);
  const filters = cloudFilters(config, query, deps.now());
  const projects = Object.keys(filters);
  const { done, warnings } = await eachProject(projects, async (project) => {
    const out = await gcloud(deps.run, project, [
      'logging',
      'read',
      filters[project] as string,
      '--project',
      project,
      '--format',
      'json',
      '--limit',
      String(limit),
    ]);
    return jsonList(out).map((entry) => cloudEntry(entry, config, project));
  });
  const entries = done
    .flatMap((read) => read.value)
    .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
    .slice(0, limit);
  return { filters, entries, warnings };
}
