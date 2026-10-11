import { z } from 'zod';
import { isRepoName } from '../sources/github.js';

// A GitHub ticket view as tickets.yaml keeps it (CONTEXT.md, Ticket view): one repo's issues,
// narrowed by labels and a milestone, to the person's open issues unless it says not. In GitHub's
// words what a project follows is a repo, each view one followed repo.

export const GithubViewSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  provider: z.literal('github'),
  /** The repo, owner/repo. */
  repo: z.string().refine(isRepoName, 'a GitHub view names its repo as owner/repo'),
  /** Issues with every one of these labels. */
  labels: z.array(z.string().trim().min(1)).min(1).optional(),
  /** Issues in this milestone, by its number, or with none. */
  milestone: z.union([z.number().int().positive(), z.literal('none')]).optional(),
  /** The milestone's title, kept to show it. */
  milestoneTitle: z.string().optional(),
  /** Every assignee's issues, not only the person's. */
  everyone: z.boolean().optional(),
  /** Closed issues too. */
  showDone: z.boolean().optional(),
});
export type GithubView = z.infer<typeof GithubViewSchema>;

/**
 * What `mesa tickets views add --provider github` takes: the repo, or the project whose origin
 * remote names it, and a milestone by its title, its number, or `none`.
 */
export type GithubViewInput = Omit<
  GithubView,
  'provider' | 'repo' | 'milestone' | 'milestoneTitle'
> & { provider: 'github'; repo?: string; project?: string; milestone?: string };

/**
 * `view` in a line, as the view switcher's second line shows it: the repo's owner, then its
 * labels, milestone, and whose, or that it lists open issues.
 */
export function describeGithubView(view: GithubView): string {
  const owner = view.repo.split('/')[0];
  const milestone =
    view.milestone === 'none' ? 'no milestone' : (view.milestoneTitle ?? view.milestone);
  const narrowing = [
    ...(view.labels ?? []),
    ...(milestone === undefined ? [] : [String(milestone)]),
    ...(view.everyone ? [] : ['assigned to me']),
  ];
  const which = narrowing.length ? narrowing : [view.showDone ? 'all issues' : 'open issues'];
  return [owner, ...which, ...(view.showDone && narrowing.length ? ['closed too'] : [])].join(', ');
}
