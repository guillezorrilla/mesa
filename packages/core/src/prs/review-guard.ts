import type { Agent } from '../agents/names.js';
import type { SessionReview } from '../sessions/record/record.js';

// The direct PR writes a review session must leave to `mesa prs` (ADR-0024): posting, approving,
// merging or declining through `gh` or `twg`. Claude Code refuses these commands at launch
// (--disallowedTools); reads such as `gh pr view` or `twg ... get` stay allowed. A wrapped call
// (`bash -c`, `xargs`), a raw HTTP call or an MCP tool is not matched: the prompt forbids those.
const GH = ['gh pr review', 'gh pr comment', 'gh pr merge', 'gh api'];
const TWG_WRITES = ['approve', 'merge', 'decline', 'request-changes', 'comment create'];
// twg takes `bitbucket` or `bb`, and `pull-requests` or `prs`.
const TWG = ['bitbucket', 'bb'].flatMap((product) =>
  ['pull-requests', 'prs'].flatMap((noun) =>
    TWG_WRITES.map((write) => `twg ${product} ${noun} ${write}`),
  ),
);

/** Claude Code's deny rules for a review session, as `Bash(<prefix>:*)`. */
export const REVIEW_DENY = [...GH, ...TWG].map((prefix) => `Bash(${prefix}:*)`);

/** The deny rules a session starts with: a Claude review session's, else none. */
export const reviewDeny = (agent: Agent, review: SessionReview | undefined): readonly string[] =>
  agent === 'claude' && review ? REVIEW_DENY : [];

/**
 * What keeps a review session from writing to the PR outside `mesa prs`: deny rules at launch,
 * or only its prompt when its agent has no such switch. None for a session that is no review.
 */
export const reviewGuard = (
  agent: string,
  review: SessionReview | undefined,
): 'deny-rules' | 'prompt' | undefined =>
  review ? (reviewDeny(agent as Agent, review).length ? 'deny-rules' : 'prompt') : undefined;

/** A review session that only its prompt keeps from posting: an agent without deny rules. */
export const promptGuarded = (agent: string, review: SessionReview | undefined) =>
  reviewGuard(agent, review) === 'prompt';
