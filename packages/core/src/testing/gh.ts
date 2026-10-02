import type { RunResult } from '../lib/process.js';

/** One invented pull request as a fake gh reports it; its lists can grow between calls. */
export type FakePullRequest = {
  number: number;
  branch: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  /** From a fork. */
  crossRepository?: boolean;
  /** statusCheckRollup entries, as `gh pr view --json` prints them. */
  checks: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  comments: Record<string, unknown>[];
  /** REST pull request review comments, as `gh api .../pulls/<n>/comments` prints them. */
  reviewComments: Record<string, unknown>[];
};

/**
 * gh over invented pull requests in `example/repo`, for scriptedRunner's `gh`: `--version`,
 * `auth status` (failing while `loggedIn` is false), `pr list`, `pr view <n>`, and
 * `api repos/{owner}/{repo}/pulls/<n>/comments`. Never the real GitHub.
 */
export function fakeGh(pullRequests: FakePullRequest[] = []) {
  const world = { pullRequests, loggedIn: true };
  const failed = (detail: string): RunResult => ({ ok: false, reason: 'failed', detail });
  const url = (n: number) => `https://github.com/example/repo/pull/${n}`;
  const answer = (args: string[]): string | RunResult => {
    const [first, second, third] = args;
    if (first === '--version') return 'gh version 2.test (2026-09-01)\n';
    if (first === 'auth')
      return world.loggedIn
        ? 'Logged in to github.com\n'
        : failed('You are not logged into any GitHub hosts. To log in, run: gh auth login');
    if (!world.loggedIn)
      return failed('To get started with GitHub CLI, please run:  gh auth login');
    if (first === 'pr' && second === 'list')
      return JSON.stringify(
        world.pullRequests.map((pr) => ({
          number: pr.number,
          title: `Invented change ${pr.number}`,
          url: url(pr.number),
          state: pr.state ?? 'OPEN',
          isDraft: false,
          headRefName: pr.branch,
          isCrossRepository: pr.crossRepository ?? false,
          updatedAt: '2026-09-24T12:00:00Z',
          mergedAt: null,
          closedAt: null,
        })),
      );
    const pr = world.pullRequests.find((p) => String(p.number) === third);
    if (first === 'pr' && second === 'view' && pr)
      return JSON.stringify({
        statusCheckRollup: pr.checks,
        reviews: pr.reviews,
        comments: pr.comments,
      });
    const path = second ?? '';
    const inline = world.pullRequests.find((p) => path.includes(`/pulls/${p.number}/comments`));
    if (first === 'api' && inline) return JSON.stringify(inline.reviewComments);
    return failed(`fake gh: no answer for ${args.join(' ')}`);
  };
  return Object.assign(world, { answer });
}
