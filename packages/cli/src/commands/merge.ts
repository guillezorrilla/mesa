import { defineCommand } from '../command.js';
import { recordedOutput } from '../output/recorded.js';

export const merge = defineCommand({
  name: 'merge',
  summary:
    "Merge a worker's branch into its parent's checkout with git merge --no-ff; on a conflict it aborts, names the files and exits 1",
  args: ['child'],
  flags: {
    into: {
      type: 'string',
      description: 'The session whose checkout it merges into; default: the one it reports to',
    },
  },
  example: 'mesa merge b2c3d4e5',
  run: async ({ mesa, args, flags }) => {
    const done = await mesa.sessions.merge(args.child, flags.into);
    const r = done.result;
    const text = r.merged
      ? `merged ${r.branch} into ${r.into} (${r.checkout})`
      : `not merged: ${r.branch} conflicts with ${r.into} in ${r.conflicts.join(', ')}; the merge was aborted`;
    return { ...recordedOutput(done, { data: r, text }), ...(r.merged ? {} : { code: 1 }) };
  },
});
