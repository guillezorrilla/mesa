import { z } from 'zod';
import { HttpsUrl } from '../git/pull-requests.js';
import type { PrFacts } from './buckets.js';
import type { PrDraft, PrHead } from './reader.js';

/** A summary draft's id: the pending review's, marked so discard clears the body, not a comment. */
export const SUMMARY_PREFIX = 'review:';

/** My pending review's body as a draft with no place: the review summary. */
export const summaryDraft = (review: { id: string; body: string }): PrDraft => ({
  id: `${SUMMARY_PREFIX}${review.id}`,
  path: null,
  line: null,
  body: review.body,
});

// What a PR tells the bucket rule, read the same way by the list and the detail.
// ponytail: the last 50 of each event list per PR; page when a PR outgrows it.
export const PR_FACTS = `fragment PrFacts on PullRequest {
  number title url headRefName updatedAt state
  author { login }
  reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
  reviews(last: 50) { nodes { author { login } state submittedAt } }
  comments(last: 50) { nodes { author { login } createdAt } }
  commits(last: 50) { nodes { commit { committedDate } } }
  reviewThreads(first: 100) {
    nodes { isResolved comments(last: 50) { nodes { author { login } createdAt state } } }
  }
}`;

// A deleted account comes back as a null author.
export const Login = z
  .object({ login: z.string() })
  .nullable()
  .transform((a) => a?.login ?? 'ghost');
export const Nodes = <T extends z.ZodType>(node: T) => z.object({ nodes: z.array(node) });

const Comment = z.object({ author: Login, createdAt: z.string() });
/** An inline comment; PENDING is a draft only its author sees, SUBMITTED everyone does. */
export const ThreadComment = Comment.extend({ state: z.string() });
export const Thread = z.object({ isResolved: z.boolean(), comments: Nodes(ThreadComment) });

export const PrNode = z.object({
  number: z.number().int(),
  title: z.string(),
  url: HttpsUrl,
  headRefName: z.string(),
  updatedAt: z.string(),
  state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
  author: Login,
  reviewRequests: Nodes(
    z.object({ requestedReviewer: z.object({ login: z.string().optional() }).nullable() }),
  ),
  reviews: Nodes(
    z.object({ author: Login, state: z.string(), submittedAt: z.string().nullable() }),
  ),
  comments: Nodes(Comment),
  commits: Nodes(z.object({ commit: z.object({ committedDate: z.string() }) })),
  reviewThreads: Nodes(Thread),
});
type PrNode = z.infer<typeof PrNode>;

const STATE = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' } as const;
const REVIEW_STATE = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes' } as const;

/** A thread's comments others can see: my pending drafts are not events yet. */
export const submitted = <T extends { state: string }>(comments: T[]) =>
  comments.filter((c) => c.state !== 'PENDING');

/** A PR as the list and the detail both name it, with the facts the bucket rule reads. */
export function toPr(pr: PrNode, me: string): PrHead & PrFacts {
  const threads = pr.reviewThreads.nodes
    .map((t) => ({ resolved: t.isResolved, comments: submitted(t.comments.nodes) }))
    .filter((t) => t.comments.length);
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    branch: pr.headRefName,
    updatedAt: pr.updatedAt,
    author: pr.author,
    authorName: pr.author,
    state: STATE[pr.state],
    requested: pr.reviewRequests.nodes.some((r) => r.requestedReviewer?.login === me),
    reviews: pr.reviews.nodes.flatMap((r) =>
      r.submittedAt && r.state !== 'PENDING' && r.state !== 'DISMISSED'
        ? [
            {
              author: r.author,
              state: REVIEW_STATE[r.state as keyof typeof REVIEW_STATE] ?? 'commented',
              at: r.submittedAt,
            },
          ]
        : [],
    ),
    comments: [...pr.comments.nodes, ...threads.flatMap((t) => t.comments)].map((c) => ({
      author: c.author,
      at: c.createdAt,
    })),
    commits: pr.commits.nodes.map((c) => c.commit.committedDate),
    threads: threads.map((t) => ({
      author: t.comments[0]?.author ?? 'ghost',
      resolved: t.resolved,
    })),
  };
}
