import { defineCommand } from '../command.js';
import { wholeNumber } from '../input/flags.js';

export const wait = defineCommand({
  name: 'wait',
  summary:
    'Block until each session is idle, waiting on a person, or over (--any: one of them), for scripts that cannot end a turn; past --timeout it fails with timeout',
  args: ['ids...'],
  flags: {
    any: { type: 'boolean', description: 'Return once any one of them left working' },
    timeout: {
      type: 'string',
      description: 'Seconds to wait before failing with timeout (default 1800, 30 minutes)',
    },
  },
  example: 'mesa wait b2c3d4e5 c3d4e5f6 --timeout 600',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.sessions.wait(args.ids, {
      any: flags.any,
      timeoutSeconds:
        flags.timeout === undefined ? undefined : wholeNumber(flags.timeout, '--timeout'),
    });
    return { data, text: data.sessions.map((s) => `${s.id} ${s.state}`).join('\n') };
  },
});
