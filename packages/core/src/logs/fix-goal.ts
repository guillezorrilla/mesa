import type { CloudErrorGroup } from './errors.js';

// Fix in session's goal (CONTEXT.md, Cloud Logs): what a session started from an error group is
// asked to do. Pure, so the app bundles it.

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
