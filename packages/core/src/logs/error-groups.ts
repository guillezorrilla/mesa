import { clip } from '../lib/clip.js';
import { cloudLevel, splitMessage } from './cloud-entry.js';
import type { CloudErrorGroup } from './errors.js';
import type { CloudLogEntry } from './gcp.js';
import { errorGroups } from './groups.js';

// Errors mode's groups made from a Logging read (CONTEXT.md, Cloud Logs), as the Logs panel
// groups errors, each with its own entries for its stats and its incidents.

/**
 * Errors among `entries` (newest first, as a read gives them) grouped as the Logs panel groups
 * them (errorGroups): by exception and own frame, else by normalized message; most first.
 */
export function groupErrors(project: string, entries: readonly CloudLogEntry[]): CloudErrorGroup[] {
  return grouped(project, entries).map((g) => g.group);
}

/** groupErrors with each group's own entries, newest first, for its stats and its incidents. */
export function grouped(project: string, entries: readonly CloudLogEntry[]) {
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
