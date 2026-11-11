import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';
import { recordedOutput } from '../../output/recorded.js';

export const gitDiscard = defineCommand({
  name: 'git discard',
  summary:
    'Throw away changes: tracked files return to HEAD, untracked files are deleted; needs --yes',
  args: ['project', 'paths...'],
  flags: {
    checkout: CHECKOUT_FLAG,
    all: { type: 'boolean', description: 'Discard every change in the checkout' },
    yes: {
      type: 'boolean',
      description: 'Discard for real; without it, name what would be discarded and change nothing',
    },
  },
  example: 'mesa git discard lantern-cove README.md notes/draft.md --yes',
  run: async ({ mesa, args, flags }) => {
    const recorded = await mesa.git.discard(
      args.project,
      { paths: args.paths, all: flags.all, yes: flags.yes },
      flags.checkout,
    );
    const { discarded } = recorded.result;
    return recordedOutput(recorded, {
      data: recorded.result,
      text: discarded
        .map((file) => `${file.untracked ? 'deleted' : 'discarded'} ${file.path}`)
        .join('\n'),
    });
  },
});
