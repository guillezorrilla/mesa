import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';

export const gitGraph = defineCommand({
  name: 'git graph',
  summary: 'Show up to 100 commits in all local branches or one selected branch',
  args: ['project'],
  flags: {
    checkout: CHECKOUT_FLAG,
    branch: { type: 'string', description: 'Filter to one local branch' },
  },
  example: 'mesa git graph lantern-cove --branch main',
  run: async ({ mesa, args, flags }) => {
    const graph = await mesa.git.graph(args.project, flags.checkout, flags.branch);
    return {
      data: graph,
      text:
        graph.rows
          .map(
            (row) =>
              `${row.graph}${row.commit ? `${row.commit.oid.slice(0, 7)} ${row.commit.subject}` : ''}`,
          )
          .join('\n') || 'no commits',
    };
  },
});

export const gitCompare = defineCommand({
  name: 'git compare',
  summary: 'Compare two commit refs with divergence counts and a patch',
  args: ['project', 'base', 'head'],
  flags: { checkout: CHECKOUT_FLAG },
  example: 'mesa git compare lantern-cove main feature/readme',
  run: async ({ mesa, args, flags }) => {
    const compared = await mesa.git.compare(args.project, args.base, args.head, flags.checkout);
    return {
      data: compared,
      text: `${compared.behind} behind, ${compared.ahead} ahead\n${compared.patch}`,
    };
  },
});
