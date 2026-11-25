import { splitMessage } from './cloud-entry.js';
import type { CloudErrorGroup } from './errors.js';
import type { CloudLogEntry } from './gcp.js';

// Fix in session's goal (CONTEXT.md, Cloud Logs): what a session started from an error group is
// asked to do. Pure, so the app bundles it.

/** One entry as an error group of one, for Fix in session from the Explorer. */
export function entryGroup(entry: CloudLogEntry): CloudErrorGroup {
  return {
    project: entry.project,
    id: entry.id,
    message: splitMessage(entry.message).head,
    sample: entry.message,
    count: 1,
    firstSeen: entry.time,
    lastSeen: entry.time,
    services: entry.service ? [entry.service] : [],
    badge: null,
    source: 'logs',
  };
}

/** The goal of a session that fixes `group`: its message, counts, services, a sample and its query. */
export function errorFixGoal(group: CloudErrorGroup) {
  const query =
    group.source === 'error-reporting'
      ? `errors samples ${group.project} ${group.id}`
      : `gcp --project ${group.project} --severity error --text ${JSON.stringify(group.message.slice(0, 80))}`;
  return [
    `Fix this error from Cloud Logs: ${group.message}`,
    '',
    `It happened ${group.count} times in ${group.project} (${group.services.join(', ') || 'no service'}), first ${group.firstSeen}, last ${group.lastSeen}.`,
    '',
    'One occurrence, with its stack:',
    group.sample || group.samples?.[0]?.message || group.message,
    '',
    `The query: mesa logs ${query}`,
  ].join('\n');
}
