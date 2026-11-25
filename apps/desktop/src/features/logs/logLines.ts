import type { LogSource, ServerLogEntry } from '@mesa/core';

/** Which entries the panel shows by level: every one, errors, or warnings. */
export type LevelFilter = 'all' | 'error' | 'warn';

/** An entry with a key that stays its own across polls, for selection and for spotting new errors. */
export type KeyedEntry = ServerLogEntry & { key: string };

/**
 * `entries` keyed by their time, level and message, and which repeat of those it is.
 * shortcut: a repeat with no time is keyed by its count in the window read, so one sliding out of
 * the window renumbers the rest; fine while docker stamps its lines, revisit if untimed sources miss errors.
 */
export function keyed(entries: readonly ServerLogEntry[]): KeyedEntry[] {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.time}|${entry.level}|${entry.message}`;
    const repeat = seen.get(base) ?? 0;
    seen.set(base, repeat + 1);
    return { ...entry, key: `${base}#${repeat}` };
  });
}

/** How many entries each level filter shows. */
export const levelCounts = (entries: readonly ServerLogEntry[]): Record<LevelFilter, number> => ({
  all: entries.length,
  error: entries.filter((entry) => entry.level === 'error').length,
  warn: entries.filter((entry) => entry.level === 'warn').length,
});

/** The entries `level` and the words in `text` keep: in the message or the stack, any case. */
export function shownEntries<E extends ServerLogEntry>(
  entries: readonly E[],
  level: LevelFilter,
  text: string,
) {
  const words = text.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (level === 'all' || entry.level === level) &&
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

/** An entry's level as the panel prints it. */
export const levelName = (entry: ServerLogEntry) => entry.level?.toUpperCase() ?? '';

/** How a source is named in the picker and in what the agent is sent. */
export const sourceLabel = (source: LogSource) =>
  source.kind === 'docker'
    ? `${source.name} (Docker)`
    : source.kind === 'file'
      ? `${source.name} (log file)`
      : `${source.name} (session)`;

/** What Send to agent types into the composer: the source's name, then the lines in a code block. */
export function logPrompt(sourceName: string, entries: readonly ServerLogEntry[]) {
  const lines = entries.map((entry) =>
    [
      [
        clockTime(entry.time),
        entry.level && !entry.message.includes(levelName(entry)) && levelName(entry),
        entry.message,
      ]
        .filter(Boolean)
        .join(' '),
      entry.stack,
    ]
      .filter(Boolean)
      .join('\n'),
  );
  const body = lines.join('\n');
  const fence = body.includes('```') ? '~~~~' : '```';
  return `These lines from the ${sourceName} log:\n${fence}\n${body}\n${fence}\n`;
}
