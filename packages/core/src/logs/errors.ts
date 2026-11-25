import { clip } from '../lib/clip.js';
import type { Http } from '../lib/http.js';
import type { Runner } from '../lib/process.js';
import type { MesaError } from '../lib/result.js';
import { cloudLevel, splitMessage } from './cloud-entry.js';
import type { Facet } from './facets.js';
import { accessToken, type CloudWarning, eachProject, googleGet } from './gcloud.js';
import {
  type CloudLogEntry,
  type CloudQuery,
  cloudFilters,
  cloudLogs,
  envOf,
  servicesByProject,
} from './gcp.js';
import type { GcpLogs } from './gcp-config.js';
import { errorGroups } from './groups.js';
import { groupStats, incidentsOf } from './incidents.js';
import { sinceTime } from './since.js';

// Errors mode (CONTEXT.md, Cloud Logs): the error groups Error Reporting keeps for each GCP
// project, read over its REST API with gcloud's access token; a project without Error Reporting
// data has its errors grouped here instead, from a Logging read.

export type CloudErrorGroup = {
  project: string;
  /** Error Reporting's group id, or for a group made here, its normalised message. */
  id: string;
  /** Its message's first line. */
  message: string;
  /** One whole occurrence, its stack too, cut to 4000 characters: what a fix starts from. */
  sample: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  services: string[];
  /** `new`: first seen in the range; `back`: a group marked resolved that came back. */
  badge: 'new' | 'back' | null;
  source: 'error-reporting' | 'logs';
  /** A group made here keeps a few of its entries as samples. */
  samples?: CloudLogEntry[];
  /** A group made here that Error Reporting also keeps: its id and its count over every env. */
  reported?: { id: string; count: number };
  /** From the entries read for it: counts over the range, its top message variants, its facets. */
  spark?: number[];
  variants?: { message: string; count: number }[];
  facets?: Facet[];
};

export type ErrorDeps = { run: Runner; http: Http; now: () => Date };

const API = 'https://clouderrorreporting.googleapis.com/v1beta1/projects';

/** Error Reporting's period that covers `since`: it reads fixed periods only. */
function period(sinceMs: number) {
  const hours = sinceMs / 3_600_000;
  if (hours <= 1) return 'PERIOD_1_HOUR';
  if (hours <= 6) return 'PERIOD_6_HOURS';
  if (hours <= 24) return 'PERIOD_1_DAY';
  if (hours <= 24 * 7) return 'PERIOD_1_WEEK';
  return 'PERIOD_30_DAYS';
}

/**
 * Errors among `entries` (newest first, as a read gives them) grouped as the Logs panel groups
 * them (errorGroups): by exception and own frame, else by normalized message; most first.
 */
export function groupErrors(project: string, entries: readonly CloudLogEntry[]): CloudErrorGroup[] {
  return grouped(project, entries).map((g) => g.group);
}

/** groupErrors with each group's own entries, newest first, for its stats and its incidents. */
function grouped(project: string, entries: readonly CloudLogEntry[]) {
  const asPanel = [...entries].reverse().map((entry) => {
    const { head, stack } = splitMessage(entry.message);
    return {
      ...entry,
      level: cloudLevel(entry.severity),
      message: head,
      logger: entry.service,
      stack,
      whole: entry.message,
    };
  });
  const plain = (list: typeof asPanel) =>
    list.map(({ level: _, logger: __, stack: ___, whole, ...entry }) => ({
      ...entry,
      message: whole,
    }));
  return errorGroups(asPanel)
    .map((group) => {
      const newest = group.entries.at(-1);
      const own = plain(group.entries).reverse();
      const made: CloudErrorGroup = {
        project,
        id: group.key,
        message: group.title,
        sample: clip(newest?.whole ?? group.title, 4000),
        count: group.count,
        firstSeen: group.entries[0]?.time ?? '',
        lastSeen: group.last ?? '',
        services: [...new Set(group.entries.map((e) => e.service).filter((s): s is string => !!s))],
        // Only the range was read, so a group made here cannot tell new from old: no badge.
        badge: null,
        source: 'logs',
        samples: own.slice(0, 5),
      };
      return { group: made, entries: own };
    })
    .sort((a, b) => b.group.count - a.group.count);
}

type GroupStat = {
  group?: { groupId?: string; resolutionStatus?: string };
  count?: string | number;
  firstSeenTime?: string;
  lastSeenTime?: string;
  affectedServices?: { service?: string }[];
  representative?: { message?: string };
};

/** One project's Error Reporting groups over `since`, most first; none when it keeps none. */
async function reportedGroups(
  deps: ErrorDeps,
  project: string,
  since: string,
  token: string,
  services: readonly string[] = [],
) {
  const from = Date.parse(sinceTime(since, deps.now()));
  // groupStats filters by one service; several are filtered here from each group's services.
  const one =
    services.length === 1
      ? `&serviceFilter.service=${encodeURIComponent(services[0] as string)}`
      : '';
  const url = `${API}/${encodeURIComponent(project)}/groupStats?timeRange.period=${period(deps.now().getTime() - from)}&order=COUNT_DESC&pageSize=50${one}`;
  const body = await googleGet(deps.run, deps.http, project, url, token);
  const stats = (body.errorGroupStats ?? []) as GroupStat[];
  const groups = stats.map((stat): CloudErrorGroup => {
    const firstSeen = stat.firstSeenTime ?? '';
    return {
      project,
      id: stat.group?.groupId ?? '',
      message: (stat.representative?.message ?? '').split('\n')[0] ?? '',
      sample: clip(stat.representative?.message ?? '', 4000),
      count: Number(stat.count ?? 0),
      firstSeen,
      lastSeen: stat.lastSeenTime ?? '',
      services: [
        ...new Set((stat.affectedServices ?? []).map((s) => s.service ?? '').filter(Boolean)),
      ],
      badge:
        Date.parse(firstSeen) >= from
          ? 'new'
          : stat.group?.resolutionStatus === 'RESOLVED'
            ? 'back'
            : null,
      source: 'error-reporting',
    };
  });
  return services.length > 1
    ? groups.filter((g) => g.services.some((s) => services.includes(s)))
    : groups;
}

/** Why Error Reporting could not be read for `project`, and what fixes it, as a warning. */
function reportingNote(project: string, error: unknown): CloudWarning {
  const status = ((error as MesaError).details as { status?: number } | undefined)?.status;
  const fix = ((error as MesaError).details as { fix?: string } | undefined)?.fix;
  const why =
    status === 403
      ? 'the Error Reporting API is off for it, or the account lacks Error Reporting Viewer'
      : error instanceof Error
        ? error.message
        : String(error);
  return {
    project,
    message: `Error Reporting could not be read for ${project} (${why}): its errors are grouped from the logs instead, with no New or Back again badges`,
    ...(fix
      ? { fix }
      : status === 403
        ? { fix: `gcloud services enable clouderrorreporting.googleapis.com --project ${project}` }
        : {}),
  };
}

/** A group's key across projects, as incidents and the app name it. */
export const groupKey = (group: Pick<CloudErrorGroup, 'project' | 'id'>) =>
  `${group.project} ${group.id}`;

/** A message's group key as the core grouping makes it (errorGroups), so both sources' groups meet. */
const keyOf = (project: string, message: string) =>
  groupErrors(project, [
    {
      project,
      id: '',
      time: '',
      severity: 'ERROR',
      service: null,
      message,
      trace: null,
      fields: {},
    },
  ])[0]?.id;

/** A service name Error Reporting gives that is a resource type, not a service (`gke_instances`). */
const RESOURCE_TYPE = /_instances?$/;

const later = (a: string, b: string) => (Date.parse(b) > Date.parse(a) ? b : a);

/**
 * `fromLogs` (grouped from a Logging read with every filter) with Error Reporting's badge, id and
 * count over every env merged into each group it also keeps: the groups when an env is picked, as
 * Error Reporting keeps no env.
 */
function withReported(fromLogs: CloudErrorGroup[], reported: CloudErrorGroup[], project: string) {
  const byKey = new Map(reported.map((g) => [keyOf(project, g.sample || g.message), g]));
  return fromLogs.map((group) => {
    const known = byKey.get(group.id);
    return known
      ? { ...group, badge: known.badge, reported: { id: known.id, count: known.count } }
      : group;
  });
}

/**
 * `reported` labelled with the services the logs name for the same group (container, Cloud Run
 * service or App Engine module), else Error Reporting's own less any resource type, and last seen
 * at the newest entry read when that is newer.
 */
function labelled(reported: CloudErrorGroup[], fromLogs: CloudErrorGroup[], project: string) {
  const byKey = new Map(fromLogs.map((g) => [g.id, g]));
  return reported.map((group) => {
    const seen = byKey.get(keyOf(project, group.sample || group.message) ?? '');
    return {
      ...group,
      services: seen?.services.length
        ? seen.services
        : group.services.filter((s) => !RESOURCE_TYPE.test(s)),
      lastSeen: seen ? later(group.lastSeen, seen.lastSeen) : group.lastSeen,
    };
  });
}

/**
 * The error groups across the GCP projects over `query.since`. With an env picked, each project's
 * errors grouped here from a Logging read with every filter, Error Reporting's badges merged in
 * (withReported); for every env (no env, ALL_ENVS), Error Reporting's groups (only its services
 * filter applies), labelled from the same read; a project Error Reporting keeps nothing for, or
 * cannot be read for, is grouped from the logs, with a warning naming the fix.
 */
export async function cloudErrors(deps: ErrorDeps, config: GcpLogs, query: CloudQuery) {
  const since = query.since ?? '1h';
  const range = { from: Date.parse(sinceTime(since, deps.now())), to: deps.now().getTime() };
  const env = envOf(config, query.env);
  const picked = servicesByProject(config, query.services);
  const projects = Object.keys(cloudFilters(config, query, deps.now()));
  // One token for every project's call: each costs a gcloud start.
  const token = await accessToken(deps.run).then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  const { done, warnings } = await eachProject(projects, async (project) => {
    let note: CloudWarning | undefined;
    const reading = cloudLogs({ run: deps.run, now: deps.now }, config, {
      ...query,
      projects: [project],
      severity: 'error',
      since,
      limit: 1000,
    });
    let reported: CloudErrorGroup[] = [];
    if ('value' in token) {
      try {
        reported = await reportedGroups(deps, project, since, token.value, picked?.get(project));
      } catch (error) {
        note = reportingNote(project, error);
      }
    } else note = reportingNote(project, token.error);
    // With Error Reporting's groups in hand, a failed read only costs their labels.
    const read = await reading.catch((error: unknown) => {
      if (env || !reported.length) throw error;
      return { entries: [] };
    });
    const made = grouped(project, read.entries);
    const fromLogs = made.map((g) => g.group);
    const listed =
      env || !reported.length
        ? withReported(fromLogs, reported, project)
        : labelled(reported, fromLogs, project);
    // Each group's own entries: its logs group's, found by the same key for a reported one.
    const byKey = new Map(made.map((g) => [g.group.id, g.entries]));
    const entriesOf = (group: CloudErrorGroup) =>
      byKey.get(group.id) ??
      byKey.get(keyOf(project, group.sample || group.message) ?? '') ??
      group.samples ??
      [];
    const groups = listed.map((group) => ({
      group: { ...group, ...groupStats(entriesOf(group), range) },
      entries: entriesOf(group),
    }));
    return { groups, note };
  });
  const all = done.flatMap((d) => d.value.groups).sort((a, b) => b.group.count - a.group.count);
  const notes = done.flatMap((d) => (d.value.note ? [d.value.note] : []));
  const incidents = incidentsOf(
    all.map(({ group, entries }) => ({
      key: groupKey(group),
      message: group.message,
      services: group.services,
      entries,
    })),
    range,
  );
  return {
    env: env ?? null,
    groups: all.map((g) => g.group),
    incidents,
    warnings: [...notes, ...warnings],
  };
}

/** A few recent events of Error Reporting group `id` in `project`, their stacks whole. */
export async function errorSamples(deps: ErrorDeps, project: string, id: string, since = '1d') {
  const from = Date.parse(sinceTime(since, deps.now()));
  const url = `${API}/${encodeURIComponent(project)}/events?groupId=${encodeURIComponent(id)}&timeRange.period=${period(deps.now().getTime() - from)}&pageSize=10`;
  const body = await googleGet(deps.run, deps.http, project, url);
  const events = (body.errorEvents ?? []) as {
    eventTime?: string;
    message?: string;
    serviceContext?: { service?: string };
  }[];
  return events.map((event) => ({
    time: event.eventTime ?? '',
    service: event.serviceContext?.service ?? null,
    message: event.message ?? '',
  }));
}
