import { defineCommand } from '../../command.js';
import { CHECKOUT_FLAG } from '../../input/flags.js';

export const gitInsight = defineCommand({
  name: 'git insight',
  summary: 'Read local repository facts and branch-matched PR outcomes when gh is available',
  args: ['project'],
  flags: { checkout: CHECKOUT_FLAG },
  example: 'mesa git insight lantern-cove',
  run: async ({ mesa, args, flags }) => {
    const data = await mesa.git.insight(args.project, flags.checkout);
    return {
      data,
      text: [
        `${data.local.branch ?? '(detached)'} ${data.local.head.slice(0, 7)}; ${data.local.changedFiles} changed; ${data.local.worktrees} worktrees (git at ${data.local.observedAt})`,
        `PRs: ${data.pullRequests.availability} (gh at ${data.pullRequests.observedAt})`,
        ...data.pullRequests.matches.map(
          (pr) => `#${pr.number} ${pr.state} ${pr.branch} [${pr.sessionIds.join(', ')}] ${pr.url}`,
        ),
        ...(data.pullRequests.limited ? ['Only the latest 100 PRs were checked.'] : []),
      ].join('\n'),
    };
  },
});
