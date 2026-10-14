import { z } from 'zod';
import { ghGraphql, repoVars } from './github-graphql.js';
import { Nodes, PR_FACTS, PrNode, submitted, Thread, ThreadComment, toPr } from './github-pr.js';
import type { PrDraft, PrProviderApi, PrRead, PrThread } from './reader.js';

// One PR in full: the list's facts, plus its threads, my pending review and its files. Fields named
// in both PrFacts and here with the same arguments merge; the rest are aliased.
// ponytail: 100 threads, files and draft comments; page when a PR outgrows it.
const QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      ...PrFacts
      baseRefName additions deletions
      files(first: 100) { nodes { path additions deletions } }
      head: commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      reviewThreads(first: 100) {
        nodes { id path line comments(last: 50) { nodes { id body } } }
      }
      pending: reviews(states: PENDING, first: 1) {
        nodes { id body comments(first: 100) { nodes { id path line body replyTo { id } } } }
      }
    }
  }
}
${PR_FACTS}`;

const ShowThread = Thread.extend({
  id: z.string(),
  path: z.string(),
  line: z.number().int().nullable(),
  comments: Nodes(ThreadComment.extend({ id: z.string(), body: z.string() })),
});

const Response = z.object({
  data: z.object({
    viewer: z.object({ login: z.string() }),
    repository: z.object({
      pullRequest: PrNode.extend({
        baseRefName: z.string(),
        additions: z.number().int(),
        deletions: z.number().int(),
        files: Nodes(
          z.object({ path: z.string(), additions: z.number().int(), deletions: z.number().int() }),
        ).nullable(),
        head: Nodes(
          z.object({
            commit: z.object({ statusCheckRollup: z.object({ state: z.string() }).nullable() }),
          }),
        ),
        reviewThreads: Nodes(ShowThread),
        pending: Nodes(
          z.object({
            id: z.string(),
            body: z.string(),
            comments: Nodes(
              z.object({
                id: z.string(),
                path: z.string(),
                line: z.number().int().nullable(),
                body: z.string(),
                replyTo: z.object({ id: z.string() }).nullable(),
              }),
            ),
          }),
        ),
      }),
    }),
  }),
});

const CHECKS: Record<string, PrRead['checks']> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  PENDING: 'pending',
  EXPECTED: 'pending',
};

/** A summary draft's id: the pending review's, marked so discard clears the body, not a comment. */
export const SUMMARY_PREFIX = 'review:';

/** One GitHub PR in full through one `gh api graphql` call. */
export const showGithub: PrProviderApi['show'] = async (run, repo, number) => {
  const read = await ghGraphql(run, QUERY, { strings: repoVars(repo), ints: { number } }, Response);
  if (!read.ok) return read;
  const { viewer, repository } = read.value.data;
  const pr = repository.pullRequest;
  // A reply names the comment it answers; the detail names threads.
  const threadOf = new Map(
    pr.reviewThreads.nodes.flatMap((t) => t.comments.nodes.map((c) => [c.id, t.id] as const)),
  );
  const threads = pr.reviewThreads.nodes.flatMap((t): PrThread[] => {
    const [first, ...replies] = submitted(t.comments.nodes);
    if (!first) return [];
    // The PR author's answer: what the back-and-forth waits on.
    const last = replies.filter((r) => r.author === pr.author).at(-1);
    return [
      {
        id: t.id,
        author: first.author,
        path: t.path,
        line: t.line,
        body: first.body,
        resolved: t.isResolved,
        ...(last ? { lastReply: { author: last.author, body: last.body } } : {}),
      },
    ];
  });
  const review = pr.pending.nodes[0];
  const drafts: PrDraft[] = review
    ? [
        ...(review.body.trim()
          ? [{ id: `${SUMMARY_PREFIX}${review.id}`, path: null, line: null, body: review.body }]
          : []),
        ...review.comments.nodes.map((c) => ({
          id: c.id,
          path: c.path,
          line: c.line,
          body: c.body,
          ...(c.replyTo
            ? { replyTo: threadOf.get(c.id) ?? threadOf.get(c.replyTo.id) ?? c.replyTo.id }
            : {}),
        })),
      ]
    : [];
  return {
    ok: true,
    value: {
      me: viewer.login,
      pr: toPr(pr, viewer.login),
      base: pr.baseRefName,
      additions: pr.additions,
      deletions: pr.deletions,
      checks: CHECKS[pr.head.nodes[0]?.commit.statusCheckRollup?.state ?? ''] ?? null,
      threads,
      drafts,
      files: pr.files?.nodes ?? [],
    },
  };
};
