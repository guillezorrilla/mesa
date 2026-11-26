import type {
  CloudAsk,
  CloudErrorGroup,
  CloudLogEntry,
  CloudProject,
  CloudProjectGroup,
  CloudService,
  CloudSeverity,
  CloudView,
  CloudVolume,
  CloudWarning,
  EnvSuggestion,
  GcpLogs,
  Incident,
  LogSource,
  ServerLogEntry,
} from '@mesa/core';
import { command, commandWith, commandWithStdin } from './spec';

/** What picks Cloud Logs entries, as the Logs tab and a saved view hold it. */
export type CloudFilters = {
  env?: string;
  /** `<project>/<name>` each; every service when none. */
  services?: string[];
  severity?: CloudSeverity;
  text?: string;
  trace?: string;
  since?: string;
  /** Facets: JSON payload fields and their values. */
  fields?: Record<string, string>;
  /** A Logging filter of a person's own: a saved view's, a metric's, a query Ask ran. */
  filter?: string;
  /** Only these GCP projects. */
  projects?: string[];
  /** Load balancer, proxy, GKE system and audit entries too. */
  all?: boolean;
  /** The log-based metric a view maps to, whose counts Cloud Monitoring gives. */
  metric?: string;
};
export type CloudRead = {
  projects: string[];
  env: string | null;
  envs: string[];
  filters: Record<string, string>;
  entries: CloudLogEntry[];
  warnings: CloudWarning[];
};
export type CloudAsked = Omit<CloudRead, 'envs'> & {
  conversation: string;
  answer: string;
  cited: string[];
  queries: { project?: string; filter: string }[];
  run: { session: string; durationMs: number; costUsd?: number };
};

/** `mesa logs gcp`'s, `errors`'s and `ask`'s flags for `filters`; `=` so a value starting with - stays one. */
export const cloudFlags = (filters: CloudFilters) => [
  ...(filters.env ? [`--env=${filters.env}`] : []),
  ...(filters.services ?? []).map((service) => `--service=${service}`),
  ...(filters.projects ?? []).map((project) => `--project=${project}`),
  ...(filters.severity ? [`--severity=${filters.severity}`] : []),
  ...(filters.text ? [`--text=${filters.text}`] : []),
  ...(filters.trace ? [`--trace=${filters.trace}`] : []),
  ...Object.entries(filters.fields ?? {}).map(([key, value]) => `--field=${key}=${value}`),
  ...(filters.filter ? [`--filter=${filters.filter}`] : []),
  ...(filters.all ? ['--all'] : []),
  `--since=${filters.since ?? '1h'}`,
];

/**
 * The Logs panel's commands: a project's log sources, one source's entries, an IDE's log file;
 * and the Logs tab's: its Cloud Logs entries, an env's services, and Ask.
 */
export const logsCommands = {
  'logs.sources': commandWith<{ project: string }, { sources: LogSource[] }>(({ project }) => [
    'logs',
    'sources',
    '--',
    project,
  ]),
  'logs.read': commandWith<
    { source: string; project: string; tail: number },
    { source: string; entries: ServerLogEntry[] }
  >(({ source, project, tail }) => [
    'logs',
    '--project',
    project,
    '--tail',
    String(tail),
    '--',
    source,
  ]),
  'logs.files': commandWith<{ project: string }, { files: string[]; suggested: string[] }>(
    ({ project }) => ['logs', 'files', '--', project],
  ),
  'logs.addFile': commandWith<{ path: string; project: string }, { files: string[] }>(
    ({ path, project }) => ['logs', 'add', '--project', project, '--', path],
  ),
  'logs.removeFile': commandWith<{ path: string; project: string }, { files: string[] }>(
    ({ path, project }) => ['logs', 'remove', '--project', project, '--', path],
  ),
  'logs.modules': commandWith<{ project: string }, { modules: string[] }>(({ project }) => [
    'logs',
    'modules',
    '--',
    project,
  ]),
  'logs.gcp': commandWith<CloudFilters & { before?: string; limit?: number }, CloudRead>(
    ({ before, limit, ...filters }) => [
      'logs',
      'gcp',
      ...cloudFlags(filters),
      ...(before ? [`--before=${before}`] : []),
      ...(limit ? [`--limit=${limit}`] : []),
    ],
  ),
  'logs.gcpServices': commandWith<
    { env?: string },
    { env: string | null; services: CloudService[]; warnings: CloudWarning[] }
  >(({ env }) => ['logs', 'gcp', '--services', ...(env ? [`--env=${env}`] : [])]),
  'logs.gcpProjects': commandWith<
    { search?: string },
    {
      current: string | null;
      projects: CloudProject[];
      groups: Record<string, CloudProjectGroup>;
    }
  >(({ search }) => ['logs', 'projects', ...(search ? [`--search=${search}`] : [])]),
  'logs.star': commandWith<{ project: string; on: boolean }, { starred: string[] }>(
    ({ project, on }) => ['logs', 'star', ...(on ? [] : ['--off']), '--', project],
  ),
  'logs.gcpEnvs': commandWith<{ projects: string[] }, { suggestions: EnvSuggestion[] }>(
    ({ projects }) => ['logs', 'envs', ...projects.map((project) => `--project=${project}`)],
  ),
  'logs.gcpSetup': commandWith<
    { projects: string[]; envs: Record<string, string> },
    { gcp: GcpLogs }
  >(({ projects, envs }) => [
    'logs',
    'setup',
    ...projects.map((project) => `--project=${project}`),
    ...Object.entries(envs).map(([name, filter]) => `--env=${name}=${filter}`),
  ]),
  'logs.errors': commandWith<
    CloudFilters,
    {
      env: string | null;
      groups: CloudErrorGroup[];
      incidents: Incident[];
      warnings: CloudWarning[];
    }
  >((filters) => ['logs', 'errors', ...cloudFlags(filters)]),
  /** The query's entries over its whole range by severity, service and time (`mesa logs volume`). */
  'logs.volume': commandWith<CloudFilters, CloudVolume>((filters) => [
    'logs',
    'volume',
    ...cloudFlags(filters),
  ]),
  'logs.errorSamples': commandWith<
    { project: string; id: string; since?: string },
    { events: { time: string; service: string | null; message: string }[] }
  >(({ project, id, since }) => [
    'logs',
    'errors',
    'samples',
    ...(since ? [`--since=${since}`] : []),
    '--',
    project,
    id,
  ]),
  'logs.counts': commandWith<
    { projects: string[]; metric: string; since?: string },
    { counts: { start: string; count: number }[]; warnings: CloudWarning[] }
  >(({ projects, metric, since }) => [
    'logs',
    'counts',
    ...projects.map((project) => `--project=${project}`),
    `--metric=${metric}`,
    ...(since ? [`--since=${since}`] : []),
  ]),
  'logs.importMetrics': commandWith<{ project: string }, { views: CloudView[] }>(({ project }) => [
    'logs',
    'views',
    'import-metrics',
    `--project=${project}`,
  ]),
  'logs.viewsExport': commandWith<{ file: string }, { file: string; views: number }>(({ file }) => [
    'logs',
    'views',
    'export',
    '--',
    file,
  ]),
  'logs.viewsImport': commandWith<{ file: string }, { views: CloudView[] }>(({ file }) => [
    'logs',
    'views',
    'import',
    '--',
    file,
  ]),
  'logs.ask': commandWith<
    CloudFilters & { question: string; conversation?: string; allowProd?: boolean },
    CloudAsked
  >(({ question, conversation, allowProd, metric: _, ...filters }) => [
    'logs',
    'ask',
    ...cloudFlags(filters),
    ...(conversation ? [`--conversation=${conversation}`] : []),
    ...(allowProd ? ['--allow-prod'] : []),
    '--',
    question,
  ]),
  'logs.asks': command<{ asks: CloudAsk[] }>('logs', 'asks'),
  /** Signs gcloud in (`mesa logs login`): gcloud opens the browser; the call ends when the person finishes. */
  'logs.login': command<{ signedIn: true }>('logs', 'login'),
  /** Turns on the Error Reporting API in a configured GCP project (`mesa logs enable`). */
  'logs.enable': commandWith<{ project: string }, { project: string; enabled: string }>(
    ({ project }) => ['logs', 'enable', '--', project],
  ),
  /** A session from Cloud Logs (`mesa logs session`): a group's fix, sent on stdin, or an Ask carried on. */
  'logs.session': commandWithStdin<
    {
      project: string;
      group?: CloudErrorGroup;
      conversation?: string;
      env?: string;
      allowProd?: boolean;
      yes?: boolean;
    },
    { session: { id: string } }
  >(
    ({ project, conversation, env, allowProd, yes }) => [
      'logs',
      'session',
      ...(conversation ? [`--conversation=${conversation}`] : []),
      ...(env ? [`--env=${env}`] : []),
      ...(allowProd ? ['--allow-prod'] : []),
      ...(yes ? ['--yes'] : []),
      '--',
      project,
    ],
    ({ group }) => (group ? JSON.stringify(group) : ''),
  ),
  'logs.query': commandWith<CloudFilters & { sentence: string }, { query: string }>(
    ({ sentence, ...filters }) => ['logs', 'query', ...cloudFlags(filters), '--', sentence],
  ),
  /** `make: false` names the path only; the folder is made once the person copies it. */
  'logs.file': commandWith<
    { name: string; project: string; make?: boolean },
    { path: string; source: string }
  >(({ name, project, make }) => [
    'logs',
    'file',
    '--project',
    project,
    ...(make === false ? ['--path-only'] : []),
    '--',
    name,
  ]),
};
