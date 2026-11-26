import { groupErrors } from './error-groups.js';
import type { CloudErrorGroup } from './errors.js';

// Errors mode's two sources meeting (CONTEXT.md, Cloud Logs): groups made from the logs and Error
// Reporting's, matched by the key the core grouping gives a message.

/** A group's key across projects, as incidents and the app name it. */
export const groupKey = (group: Pick<CloudErrorGroup, 'project' | 'id'>) =>
  `${group.project} ${group.id}`;

/** A message's group key as the core grouping makes it (errorGroups), so both sources' groups meet. */
export const keyOf = (project: string, message: string) =>
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
export function withReported(
  fromLogs: CloudErrorGroup[],
  reported: CloudErrorGroup[],
  project: string,
) {
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
export function labelled(
  reported: CloudErrorGroup[],
  fromLogs: CloudErrorGroup[],
  project: string,
) {
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
