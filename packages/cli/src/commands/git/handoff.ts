import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';

/** Which session a checkout's problem goes to: the one working there unless told. */
const HANDOFF_FLAGS = {
  checkout: CHECKOUT_FLAG,
  session: {
    type: 'string',
    description: 'Hand it to this session instead of the one in the checkout',
  },
  new: { type: 'boolean', description: 'Start a new session in the checkout with it as its goal' },
} as const;

export const gitFix = defineCommand({
  name: 'git fix',
  summary:
    "Run a checkout's pre-commit hook; when it fails, hand its output to the idle session working there, or start one, to fix and stage (never --no-verify)",
  args: ['project'],
  flags: HANDOFF_FLAGS,
  example: 'mesa git fix lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.git.fix(args.project, {
      checkout: flags.checkout,
      session: flags.session,
      fresh: flags.new,
    });
    const text = data.passed
      ? 'the pre-commit hook passes; nothing was handed over'
      : `the pre-commit hook failed: ${data.how === 'sent' ? 'sent to' : 'started'} session ${data.session}`;
    return { data, text };
  },
});
