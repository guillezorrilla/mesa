import { entryText, LOG_LEVELS, type LogLevel, MesaError, NO_OUTPUT_LOG } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { wholeNumber } from '../../input/flags.js';

/** `--level`, checked to be one of the levels. */
function levelFlag(value: string | undefined): LogLevel | undefined {
  if (value === undefined) return undefined;
  if (!(LOG_LEVELS as readonly string[]).includes(value))
    throw new MesaError('usage', `--level must be one of ${LOG_LEVELS.join(', ')}, not ${value}`);
  return value as LogLevel;
}

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
    // A session id has no colon; anything with one is a log source (docker:, session:, file:).
    if (args.source.includes(':')) {
      const read = await mesa.logs.read(args.source, {
        tail,
        level: levelFlag(flags.level),
        since: flags.since,
        project: flags.project,
      });
      return {
        data: read,
        text:
          read.entries.map((entry) => entryText(entry)).join('\n') ||
          `no entries in ${read.source}`,
      };
    }
    const log = mesa.sessions.logs(args.source, tail);
    const text = log.path
      ? log.lines.join('\n')
      : `session ${log.session} has no output log: ${NO_OUTPUT_LOG}`;
    return { data: log, text };
  },
});
