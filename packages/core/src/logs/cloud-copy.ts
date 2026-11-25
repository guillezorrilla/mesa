import { cloudLevel, splitMessage } from './cloud-entry.js';
import { type CopyFormat, copyText, groupSummaryText } from './copy.js';
import type { CloudErrorGroup } from './errors.js';
import type { CloudLogEntry } from './gcp.js';
import type { ServerLogEntry } from './parse.js';

// Copy for Cloud Logs (CONTEXT.md, Cloud Logs): its entries and error groups through the shared
// copyText, with their project, trace, insert id and fields beside them, and a link to an entry or a
// query in the Cloud Console's Logs Explorer. Pure, so the app bundles it.

/** `since` (an age such as 1h, 6h, 1d) as the ISO duration the Cloud Console's range takes. */
function duration(since = '1h') {
  const match = /^(\d+)([mhd])$/.exec(since);
  if (!match) return 'PT1H';
  const [, n, unit] = match;
  return unit === 'd' ? `P${n}D` : `PT${n}${unit === 'h' ? 'H' : 'M'}`;
}

/**
 * The Logs Explorer link for `query` in `project` over `since`, at `at` when given (a cursor on
 * that time): what Open in Cloud Console opens.
 */
export function consoleUrl(
  project: string,
  query: string,
  options: { since?: string; at?: string } = {},
) {
  const parts = [
    `query=${encodeURIComponent(query)}`,
    ...(options.at ? [`cursorTimestamp=${options.at}`] : []),
    `duration=${duration(options.since)}`,
  ];
  return `https://console.cloud.google.com/logs/query;${parts.join(';')}?project=${encodeURIComponent(project)}`;
}

/** One entry's own link: its insert id at its time, in its project. */
export const entryConsoleUrl = (entry: CloudLogEntry) =>
  consoleUrl(entry.project, `insertId="${entry.id}"`, { at: entry.time, since: '1d' });

/** A Cloud entry in the shared copy's terms, and the fields that go beside it. */
const asLogEntry = (entry: CloudLogEntry): ServerLogEntry => {
  const { head, stack } = splitMessage(entry.message);
  return {
    time: entry.time,
    level: cloudLevel(entry.severity),
    message: head,
    logger: null,
    stack,
  };
};
const besideOf = (entry: CloudLogEntry): Record<string, string> => ({
  project: entry.project,
  ...(entry.service ? { service: entry.service } : {}),
  ...(entry.trace ? { trace: entry.trace.split('/').at(-1) as string } : {}),
  insertId: entry.id,
  ...entry.fields,
});

/** `entries` as `format` copies them (copyText); `json` is each Cloud entry whole. */
export function cloudCopyText(entries: readonly CloudLogEntry[], format: CopyFormat) {
  if (format === 'json')
    return JSON.stringify(entries.length === 1 ? entries[0] : entries, null, 2);
  const byEntry = new Map(entries.map((e) => [asLogEntry(e), e]));
  return copyText([...byEntry.keys()], format, {
    source: [...new Set(entries.map((e) => `${e.project}/${e.service ?? '-'}`))].join(', '),
    fields: (entry) => {
      const cloud = byEntry.get(entry);
      return cloud ? besideOf(cloud) : {};
    },
  });
}

/** An error group as Copy summary writes it (groupSummaryText), its newest entry whole. */
export function cloudGroupSummary(group: CloudErrorGroup, entries: readonly CloudLogEntry[]) {
  const newest = entries[0] ?? group.samples?.[0];
  const sample = newest ? [asLogEntry(newest)] : [];
  return groupSummaryText(
    {
      key: group.id,
      title: group.message,
      count: group.count,
      last: group.lastSeen,
      entries: sample,
    },
    {
      source: group.project,
      services: group.services.length ? group.services : [group.project],
      fields: () => (newest ? besideOf(newest) : {}),
    },
  ).replace(/^First seen: .*$/m, `First seen: ${group.firstSeen || 'unknown'}`);
}
