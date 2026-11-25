import type { ServerLogEntry } from './parse.js';
import { ownFrame } from './stack.js';

// Grouping and muting log entries (CONTEXT.md, Logs panel): what makes two entries the same error,
// and the same kind of line. Pure, so the app bundles it (`@mesa/core/browser`).

/** Ids, hex, uuids and numbers, which differ between lines of one kind. */
const VARYING =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?=[0-9a-f]*\d)[0-9a-f]{4,}\b|\d+(?:\.\d+)?/gi;
/** A Java or JS exception's name: `com.example.MooringException`, `TypeError`. */
const EXCEPTION = /\b(?:[a-z_$][\w$]*\.)*([A-Z][\w$]*(?:Exception|Error|Throwable))\b/;
/** A path in a message, such as an HTTP request's: `/actuator/health`. */
const PATH = /(?:^|\s)(\/[\w/.-]+)/;

/** `message` with what varies between lines of one kind (numbers, ids) as `#`. */
export const normalizedMessage = (message: string) => message.replace(VARYING, '#');

export type ErrorGroup<E extends ServerLogEntry> = {
  key: string;
  /** "NullPointerException at MooringService.java:88", else the normalized message. */
  title: string;
  count: number;
  /** The newest entry's time. */
  last: string | null;
  entries: E[];
};

/**
 * `entries`' errors grouped as the same error: by exception type and the project's own top frame,
 * else by normalized message; in order of each group's newest entry, oldest first.
 */
export function errorGroups<E extends ServerLogEntry>(entries: readonly E[]): ErrorGroup<E>[] {
  const groups = new Map<string, ErrorGroup<E>>();
  for (const entry of entries) {
    if (entry.level !== 'error') continue;
    const type = EXCEPTION.exec(entry.stack ?? '')?.[1] ?? EXCEPTION.exec(entry.message)?.[1];
    const frame = ownFrame(entry.stack);
    const title = type ? (frame ? `${type} at ${frame}` : type) : normalizedMessage(entry.message);
    const group = groups.get(title) ?? { key: title, title, count: 0, last: null, entries: [] };
    group.count++;
    group.last = entry.time ?? group.last;
    group.entries.push(entry);
    // Re-inserted, so the map's order is each group's newest entry.
    groups.delete(title);
    groups.set(title, group);
  }
  return [...groups.values()];
}

/** What one click mutes for a line: the path it names, else its normalized message. */
export const muteKey = (message: string) => PATH.exec(message)?.[1] ?? normalizedMessage(message);

/**
 * Whether `entry` matches one of `mutes`, by its message or its normalized message. An error is
 * never muted: a mute is for noise, and a path muted for its health checks still shows its failures.
 */
export function isMuted(entry: ServerLogEntry, mutes: readonly string[]) {
  if (!mutes.length || entry.level === 'error') return false;
  if (mutes.some((mute) => entry.message.includes(mute))) return true;
  const normalized = normalizedMessage(entry.message);
  return mutes.some((mute) => normalized.includes(mute));
}
