import type { Agent } from '../agents/names.js';
import type { SessionReview } from '../sessions/record/record.js';

// The PR writes a review session must leave to `mesa prs` (ADR-0024): posting, approving,
// merging or declining. Claude Code refuses these on its own at launch (--disallowedTools), so a
// slip in the session cannot post; reads such as `gh pr view` or `twg ... get` stay allowed.
const GH = ['gh pr review', 'gh pr comment', 'gh pr merge', 'gh api'];
const TWG_WRITES = ['approve', 'merge', 'decline', 'request-changes', 'comment create'];
const TWG = ['twg bitbucket pull-requests', 'twg bb pull-requests'].flatMap((cmd) =>
  TWG_WRITES.map((write) => `${cmd} ${write}`),
);

/** Claude Code's deny rules for a review session, as `Bash(<prefix>:*)`. */
export const REVIEW_DENY = [...GH, ...TWG].map((prefix) => `Bash(${prefix}:*)`);

/**
 * The deny rules a session starts with: a Claude review session's, else none. Another agent has
 * no such switch, so only its prompt guards it (`promptGuarded`).
 */
export const reviewDeny = (agent: Agent, review: SessionReview | undefined): readonly string[] =>
  agent === 'claude' && review ? REVIEW_DENY : [];

/** A review session that only its prompt keeps from posting: an agent without deny rules. */
export const promptGuarded = (agent: string, review: SessionReview | undefined) =>
  Boolean(review) && agent !== 'claude';
