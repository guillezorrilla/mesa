import type { ErrorGroup } from './groups.js';
import { LEVEL_NAMES, type ServerLogEntry } from './parse.js';
import { requestIds } from './tokens.js';

// What Copy puts on the person's clipboard (CONTEXT.md, Logs panel): log entries ready to paste in
// Slack, Jira or a pull request. Pure, so the app bundles it and Local and Cloud Logs share it.

/** How entries are copied: ready to paste (the default), the message alone, the raw entry, Markdown. */
export type CopyFormat = 'paste' | 'message' | 'json' | 'markdown';

/** Where the entries came from, and any fields beside them (a Cloud entry's labels). */
export type CopyContext = {
  /** The source or service, as the panel names it ("Docker · harbour-api"). */
  source: string;
  fields?: (entry: ServerLogEntry) => Record<string, string>;
};

/** An entry's time with its date and zone: as written when it carries a zone, else in UTC. */
function zonedTime(time: string | null) {
  if (!time) return 'no time';
  if (/(Z|[+-]\d\d:?\d\d)$/.test(time)) return time;
  const at = Date.parse(time);
  return Number.isNaN(at) ? time : new Date(at).toISOString();
}

/** A code fence that `body` cannot close. */
const fenced = (body: string) => {
  const fence = body.includes('```') ? '~~~~' : '```';
  return `${fence}\n${body}\n${fence}`;
};

/** The lines that describe one entry: what it is, its message, its full stack, its request and fields. */
function described(entry: ServerLogEntry, context: CopyContext) {
  const level = entry.level ? LEVEL_NAMES[entry.level] : 'LOG';
  const request = requestIds(entry.message)[0];
  const fields = {
    ...(request ? { request } : {}),
    ...(entry.logger ? { logger: entry.logger } : {}),
    ...context.fields?.(entry),
  };
  return {
    head: `${level} ${zonedTime(entry.time)} · ${context.source}`,
    message: entry.message,
    stack: entry.stack,
    fields: Object.entries(fields).map(([name, value]) => `${name}: ${value}`),
  };
}

/** The raw entry, without the app's own keys. */
const raw = (entry: ServerLogEntry) => ({
  time: entry.time,
  level: entry.level,
  message: entry.message,
  logger: entry.logger,
  stack: entry.stack,
});

/**
 * `entries` as `format` puts them on the clipboard. `paste`: each entry's level, time with date and
 * zone, source, message, full stack (never folded), request id and fields, as plain text in one
 * fenced block. `message`: the messages alone. `json`: the raw entries. `markdown`: each entry
 * as a bold head, its message, and its stack in a block.
 */
export function copyText(
  entries: readonly ServerLogEntry[],
  format: CopyFormat,
  context: CopyContext,
): string {
  if (format === 'message') return entries.map((entry) => entry.message).join('\n');
  if (format === 'json')
    return JSON.stringify(
      entries.length === 1 ? raw(entries[0] as ServerLogEntry) : entries.map(raw),
      null,
      2,
    );
  const each = entries.map((entry) => described(entry, context));
  if (format === 'markdown')
    return each
      .map((entry) =>
        [
          `**${entry.head}**`,
          '',
          entry.message,
          ...(entry.stack ? ['', fenced(entry.stack)] : []),
          ...(entry.fields.length ? ['', ...entry.fields.map((field) => `- ${field}`)] : []),
        ].join('\n'),
      )
      .join('\n\n');
  return fenced(
    each
      .map((entry) =>
        [entry.head, entry.message, ...(entry.stack ? [entry.stack] : []), ...entry.fields].join(
          '\n',
        ),
      )
      .join('\n\n'),
  );
}

/**
 * A group of identical errors as one note: its title, how many, when first and last seen, the
 * services it came from, and its newest entry in full (copyText, paste).
 */
export function groupSummaryText(
  group: ErrorGroup<ServerLogEntry>,
  context: CopyContext & { services?: readonly string[]; firstSeen?: string | null },
): string {
  const sample = group.entries.at(-1);
  return [
    `${group.title} (x${group.count})`,
    `First seen: ${zonedTime(context.firstSeen ?? group.entries[0]?.time ?? null)}`,
    `Last seen: ${zonedTime(group.last)}`,
    `Services: ${(context.services ?? [context.source]).join(', ')}`,
    ...(sample ? ['', 'Newest:', copyText([sample], 'paste', context)] : []),
  ].join('\n');
}
