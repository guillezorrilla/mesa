import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import { type JsonRead, runText } from '../lib/run-json.js';
import { ghGraphql, repoVars } from './github-graphql.js';
import { checksOf } from './github-pr.js';
import type { PrRead } from './reader.js';

/** How a pull request is merged, as `gh pr merge` names it; squash is Mesa's default. */
export const MERGE_METHODS = ['squash', 'merge', 'rebase'] as const;
export type MergeMethod = (typeof MERGE_METHODS)[number];

/** What a merge is decided on: the PR's state, whether it merges cleanly, its checks, its head. */
export type MergeState = {
  state: 'open' | 'merged' | 'closed';
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  checks: PrRead['checks'];
  head: string;
};

const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state mergeable headRefOid
      commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    }
  }
}`;

const Response = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
        mergeable: z.enum(['MERGEABLE', 'CONFLICTING', 'UNKNOWN']),
        headRefOid: z.string(),
        commits: z.object({
          nodes: z.array(
            z.object({
              commit: z.object({
                statusCheckRollup: z.object({ state: z.string() }).nullable(),
              }),
            }),
          ),
        }),
      }),
    }),
  }),
});

/** The PR's merge state through one `gh api graphql` call. */
export async function mergeStateGithub(
  run: Runner,
  repo: string,
  number: number,
): Promise<JsonRead<MergeState>> {
  const read = await ghGraphql(run, QUERY, { strings: repoVars(repo), ints: { number } }, Response);
  if (!read.ok) return read;
  const pr = read.value.data.repository.pullRequest;
  return {
    ok: true,
    value: {
      state: pr.state.toLowerCase() as MergeState['state'],
      mergeable: pr.mergeable.toLowerCase() as MergeState['mergeable'],
      checks: checksOf(pr.commits.nodes[0]?.commit.statusCheckRollup?.state),
      head: pr.headRefOid,
    },
  };
}

/**
 * `gh pr merge` with the method, only at the head commit the decision read, so a push after it
 * fails the merge rather than merging unseen commits. Never `--admin`: branch protection stands.
 */
export const mergeGithub = (
  run: Runner,
  repo: string,
  number: number,
  method: MergeMethod,
  head: string,
) =>
  runText(
    run,
    'gh',
    ['pr', 'merge', String(number), '--repo', repo, `--${method}`, '--match-head-commit', head],
    60_000,
  );
