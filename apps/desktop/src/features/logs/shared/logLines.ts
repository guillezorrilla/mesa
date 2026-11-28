import type { ServerLogEntry } from '@mesa/core';
import { namesRequest } from '@mesa/core/browser';

/** Which entries the panel shows by level: every one, errors, or warnings. */
export const LEVEL_FILTERS = ['all', 'error', 'warn'] as const;
export type LevelFilter = (typeof LEVEL_FILTERS)[number];

/** An entry with a key that stays its own across polls, for selection and for spotting new errors. */
export type KeyedEntry = ServerLogEntry & { key: string };

/**
 * `entries` keyed by their time, level and message, and which repeat of those it is; an entry
 * `previous` already holds is that same object, so its row does not render again.
 * shortcut: a repeat with no time is keyed by its count in the window read, so one sliding out of
 * the window renumbers the rest; fine while docker stamps its lines, revisit if untimed sources miss errors.
 */
export function keyed(
  entries: readonly ServerLogEntry[],
  previous: readonly KeyedEntry[] = [],
): KeyedEntry[] {
  const before = new Map(previous.map((entry) => [entry.key, entry]));
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.time}|${entry.level}|${entry.message}`;
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    const key = `${base}#${repeat}`;
    const kept = before.get(key);
    return kept && kept.stack === entry.stack && kept.logger === entry.logger
      ? kept
      : { ...entry, key };
  });
}

/** How many entries each level filter shows. */
export function levelCounts(entries: readonly ServerLogEntry[]): Record<LevelFilter, number> {
  const counts = { all: entries.length, error: 0, warn: 0 };
  for (const entry of entries)
    if (entry.level === 'error' || entry.level === 'warn') counts[entry.level]++;
  return counts;
}

/**
 * The entries `level`, the words in `text` (in the message or the stack, any case) and `request`
 * (an id the message names, namesRequest) keep.
 */
export function shownEntries<E extends ServerLogEntry>(
  entries: readonly E[],
  filter: { level: LevelFilter; text: string; request?: string },
) {
  const words = filter.text.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (filter.level === 'all' || entry.level === filter.level) &&
      (!filter.request || namesRequest(entry.message, filter.request)) &&
      (!words || `${entry.message}\n${entry.stack ?? ''}`.toLowerCase().includes(words)),
  );
}

/** An entry's time as this machine's clock shows it, HH:MM:SS; as written when it does not read. */
export function clockTime(time: string | null) {
  if (!time) return '';
  const at = new Date(time);
  if (Number.isNaN(at.getTime())) return /\d\d:\d\d:\d\d/.exec(time)?.[0] ?? '';
  return at.toLocaleTimeString([], { hour12: false });
}

/** A stable colour for a service: the same `<project>/<name>` gets the same hue on every read. */
export function serviceColor(ref: string) {
  let hash = 0;
  for (const char of ref) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `hsl(${hash % 360} 60% 50%)`;
}

/**
 * `time` in local time: the clock today, else the day and minute ("Nov 24 17:40"), so a first and
 * last seen read right beside today's entries.
 */
export function dayTime(time: string | null, now = new Date()) {
  if (!time) return '';
  const at = new Date(time);
  if (Number.isNaN(at.getTime())) return clockTime(time);
  if (at.toDateString() === now.toDateString()) return clockTime(time);
  const day = at.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${day} ${at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}`;
}
