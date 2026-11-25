import {
  LOG_LEVELS,
  type LogLevel,
  MesaError,
  NO_OUTPUT_LOG,
  type ServerLogEntry,
} from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';
import { columns } from '../output/columns.js';

const LEVEL_NAMES: Record<LogLevel, string> = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
};

function levelOf(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  if (!(LOG_LEVELS as readonly string[]).includes(value))
    throw new MesaError('usage', `--level must be one of ${LOG_LEVELS.join(', ')}, not ${value}`);
  return value as LogLevel;
}

/** An entry as one line, its stack under it. */
const entryText = (entry: ServerLogEntry) =>
  [
    // A plain line's level word is already in its message.
    [
      entry.time,
      entry.level && !entry.message.includes(LEVEL_NAMES[entry.level]) && LEVEL_NAMES[entry.level],
      entry.message,
    ]
      .filter(Boolean)
      .join(' '),
    entry.stack,
  ]
    .filter(Boolean)
    .join('\n');

export const logs = defineCommand({
  name: 'logs',
  summary:
    "Print a session's output log as plain text, or a log source's entries (docker:<name>, session:<id>, file:<name>)",
  args: ['source'],
  flags: {
    tail: { type: 'string', description: 'Print only the last N lines (entries for a source)' },
    level: {
      type: 'string',
      description: "A source's entries at this level or worse: error, warn, info, debug",
    },
    since: {
      type: 'string',
      description: "A source's entries since an ISO time or an age (10m, 2h)",
    },
    project: {
      type: 'string',
      description: 'The project a file: source is in (default: this one)',
    },
  },
  example: 'mesa logs docker:api --level error --tail 50',
  run: async ({ mesa, args, flags }) => {
    const tail = flags.tail === undefined ? undefined : wholeNumber(flags.tail, '--tail');
    if (args.source.includes(':')) {
      const read = await mesa.logs.read(args.source, {
        tail,
        level: levelOf(flags.level),
        since: flags.since,
        project: flags.project,
      });
      return {
        data: read,
        text: read.entries.map(entryText).join('\n') || `no entries in ${read.source}`,
      };
    }
    const log = mesa.sessions.logs(args.source, tail);
    const text = log.path
      ? log.lines.join('\n')
      : `session ${log.session} has no output log: ${NO_OUTPUT_LOG}`;
    return { data: log, text };
  },
});

export const logsSources = defineCommand({
  name: 'logs sources',
  summary:
    "List where a project's local servers print: running containers, its sessions with an output log, its log files",
  args: ['project?'],
  example: 'mesa logs sources lantern-cove',
  run: async ({ mesa, args }) => {
    const found = await mesa.logs.sources(args.project);
    return {
      data: found,
      text: found.sources.length
        ? columns(found.sources.map((source) => [source.id, source.name, source.detail])).join('\n')
        : 'no running containers, server sessions or log files for this project',
    };
  },
});

export const logsFile = defineCommand({
  name: 'logs file',
  summary:
    "Make the folder for a service's log file and print its path, for an IDE to save its console to",
  args: ['name'],
  flags: { project: { type: 'string', description: 'Its project (default: this one)' } },
  example: 'mesa logs file tide-api --project lantern-cove',
  run: ({ mesa, args, flags }) => {
    const found = mesa.logs.file(args.name, flags.project);
    return { data: found, text: found.path };
  },
});
