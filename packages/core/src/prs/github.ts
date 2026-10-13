import { z } from 'zod';
import { HttpsUrl } from '../git/pull-requests.js';
import type { PrReader } from './reader.js';

// One GraphQL call per repo: its open PRs with what the bucket rule needs, and who I am.
// ponytail: the last 50 of each event list per PR and 50 PRs per repo; page when a repo outgrows it.
const QUERY = `query($owner: String!, $name: String!) {
  viewer { login }
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        number title url headRefName updatedAt
        author { login }
        reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
        reviews(last: 50) { nodes { author { login } state submittedAt } }
        comments(last: 50) { nodes { author { login } createdAt } }
        commits(last: 50) { nodes { commit { committedDate } } }
        reviewThreads(first: 100) {
          nodes { isResolved comments(last: 50) { nodes { author { login } createdAt } } }
        }
      }
    }
  }
}`;

// A deleted account comes back as a null author.
const Login = z
  .object({ login: z.string() })
  .nullable()
  .transform((a) => a?.login ?? 'ghost');
const Nodes = <T extends z.ZodType>(node: T) => z.object({ nodes: z.array(node) });
const Comment = z.object({ author: Login, createdAt: z.string() });

const Response = z.object({
  data: z.object({
    viewer: z.object({ login: z.string() }),
    repository: z.object({
      pullRequests: Nodes(
        z.object({
          number: z.number().int(),
          title: z.string(),
          url: HttpsUrl,
          headRefName: z.string(),
          updatedAt: z.string(),
          author: Login,
          reviewRequests: Nodes(
            z.object({
              requestedReviewer: z.object({ login: z.string().optional() }).nullable(),
            }),
          ),
          reviews: Nodes(
            z.object({ author: Login, state: z.string(), submittedAt: z.string().nullable() }),
          ),
          comments: Nodes(Comment),
          commits: Nodes(z.object({ commit: z.object({ committedDate: z.string() }) })),
          reviewThreads: Nodes(z.object({ isResolved: z.boolean(), comments: Nodes(Comment) })),
        }),
      ),
    }),
  }),
});

const REVIEW_STATE = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes' } as const;

/** A GitHub repo's open PRs through `gh api graphql`; `repo` is `owner/name`. */
export const readGithub: PrReader = async (run, repo) => {
  const [owner = '', name = ''] = repo.split('/');
  const res = await run(
    'gh',
    ['api', 'graphql', '-f', `query=${QUERY}`, '-F', `owner=${owner}`, '-F', `name=${name}`],
    30_000,
  );
  if (!res.ok)
    return {
      ok: false,
      reason: res.reason === 'timeout' ? 'timeout' : 'failed',
      detail: res.detail,
    };
  let raw: unknown;
  try {
    raw = JSON.parse(res.stdout);
  } catch {
    return { ok: false, reason: 'invalid-data' };
  }
  const parsed = Response.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid-data' };
  const { viewer, repository } = parsed.data.data;
  const me = viewer.login;
  return {
    ok: true,
    me,
    prs: repository.pullRequests.nodes.map((pr) => ({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      updatedAt: pr.updatedAt,
      author: pr.author,
      state: 'open' as const,
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
      comments: [
        ...pr.comments.nodes,
        ...pr.reviewThreads.nodes.flatMap((t) => t.comments.nodes),
      ].map((c) => ({ author: c.author, at: c.createdAt })),
      commits: pr.commits.nodes.map((c) => c.commit.committedDate),
      threads: pr.reviewThreads.nodes.map((t) => ({
        author: t.comments.nodes[0]?.author ?? 'ghost',
        resolved: t.isResolved,
      })),
    })),
  };
};
