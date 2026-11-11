import { checkText } from '@mesa/core';
import { defineCommand } from '../command.js';
import { CHECKOUT_FLAG } from '../input/flags.js';

/** Run by an agent instead of the raw build or test command: one line, or only the errors. */
export const check = defineCommand({
  name: 'check',
  summary:
    "Run the project's check (mesa.yaml check) and print one line when it passes, or only its errors and the log path when it fails",
  args: ['project'],
  flags: {
    checkout: CHECKOUT_FLAG,
    timeout: { type: 'string', description: 'Seconds before the check is killed; default 1200' },
  },
  example: 'mesa check lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.check(args.project, {
      ...(flags.checkout ? { checkout: flags.checkout } : {}),
      ...(flags.timeout === undefined ? {} : { timeoutSeconds: Number(flags.timeout) }),
    });
    return { data, text: checkText(data), code: data.ok ? 0 : 1 };
  },
});
