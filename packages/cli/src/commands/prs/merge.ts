import { MERGE_CALLERS, MERGE_METHODS, type MergeCaller, MesaError } from '@mesa/core';
import { defineCommand } from '../../command.js';
import { recordedOutput } from '../../output/recorded.js';
import { prTarget } from './target.js';

export const prsMerge = defineCommand({
  name: 'prs merge',
  summary:
    'Merge a pull request through gh, squash by default, never with --admin; refused when it conflicts or a check fails unless --yes; the PR is a GitHub URL, <project> <number>, or in a session the number alone',
  args: ['pr', 'number?'],
  flags: {
    squash: { type: 'boolean', description: 'Squash its commits into one (the default)' },
    merge: { type: 'boolean', description: 'Keep its commits under a merge commit' },
    rebase: { type: 'boolean', description: 'Rebase its commits onto the base' },
    yes: { type: 'boolean', description: 'Merge even when it conflicts or a check fails' },
    caller: {
      type: 'string',
      description: `Who asked, as the receipt names them outside a session: ${MERGE_CALLERS.join(', ')} (default cli)`,
    },
  },
  example: 'mesa prs merge lantern-cove 482 --rebase',
  run: async ({ mesa, args, flags }) => {
    const methods = MERGE_METHODS.filter((m) => flags[m]);
    if (methods.length > 1)
      throw new MesaError('usage', 'pass one of --squash, --merge and --rebase');
    if (flags.caller && !MERGE_CALLERS.includes(flags.caller as MergeCaller))
      throw new MesaError('usage', `--caller must be one of ${MERGE_CALLERS.join(', ')}`);
    const pr =
      /^https?:\/\//i.test(args.pr) && args.number === undefined
        ? { url: args.pr }
        : prTarget(mesa, { project: args.pr, number: args.number });
    const recorded = await mesa.prs.merge(pr, {
      ...(methods[0] ? { method: methods[0] } : {}),
      ...(flags.yes ? { confirm: true } : {}),
      ...(flags.caller ? { caller: flags.caller as MergeCaller } : {}),
    });
    const r = recorded.result;
    return recordedOutput(recorded, {
      data: r,
      text: `Merged ${r.project} #${r.number} (${r.method}) at ${r.head.slice(0, 7)}`,
    });
  },
});
