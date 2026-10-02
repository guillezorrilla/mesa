import { z } from 'zod';
import type { Runner } from '../lib/process.js';

const PullRequestSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.url().refine((value) => new URL(value).protocol === 'https:', 'must use HTTPS'),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(),
  headRefName: z.string(),
  updatedAt: z.string(),
  mergedAt: z.string().nullable(),
  closedAt: z.string().nullable(),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

const LIMIT = 100;

export type PullRequestList =
  | { ok: true; pullRequests: PullRequest[]; limited: boolean }
  | { ok: false; reason: 'failed' | 'timeout' | 'invalid-data' };

/** The repository's latest pull requests, any state, as `gh pr list` in `cwd` reports them. */
export async function listPullRequests(run: Runner, cwd: string): Promise<PullRequestList> {
  const listed = await run(
    'gh',
    [
      'pr',
      'list',
      '--state',
      'all',
      '--limit',
      String(LIMIT),
      '--json',
      'number,title,url,state,isDraft,headRefName,updatedAt,mergedAt,closedAt',
    ],
    30_000,
    { cwd },
  );
  if (!listed.ok)
    return { ok: false, reason: listed.reason === 'missing' ? 'failed' : listed.reason };
  let raw: unknown;
  try {
    raw = JSON.parse(listed.stdout);
  } catch {
    return { ok: false, reason: 'invalid-data' };
  }
  const parsed = z.array(PullRequestSchema).safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid-data' };
  return { ok: true, pullRequests: parsed.data, limited: parsed.data.length === LIMIT };
}

/**
 * Links pull requests to sessions by branch name alone, never by authorship: each pull request
 * whose head branch a session works on, with those sessions' ids.
 */
export const matchBranches = (
  pullRequests: readonly PullRequest[],
  branchSessions: ReadonlyMap<string, readonly string[]>,
) =>
  pullRequests.flatMap((pr) => {
    const sessionIds = branchSessions.get(pr.headRefName);
    return sessionIds ? [{ pr, sessionIds: [...sessionIds] }] : [];
  });
