import { NO_OUTPUT_LOG } from '@mesa/core';
import { defineCommand } from '../command.js';
import { wholeNumber } from '../guards.js';

export const logs = defineCommand({
  name: 'logs',
  summary: "Print a session's output log as plain text, or its last lines with --tail",
  args: ['session'],
  flags: {
    tail: { type: 'string', description: 'Print only its last N lines' },
  },
  example: 'mesa logs a1b2c3d4 --tail 20',
  run: ({ mesa, args, flags }) => {
    const tail = flags.tail === undefined ? undefined : wholeNumber(flags.tail, '--tail');
    const log = mesa.sessions.logs(args.session, tail);
    const text = log.path
      ? log.lines.join('\n')
      : `session ${log.session} has no output log: ${NO_OUTPUT_LOG}`;
    return { data: log, text };
  },
});
