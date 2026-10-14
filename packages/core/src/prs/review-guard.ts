import type { SessionReview } from '../sessions/record/record.js';
import { canPost } from './review-sessions.js';

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

type Review = SessionReview | null | undefined;

/** The deny rules a session starts with: a review session's on an agent that takes them, else none. */
export const reviewDeny = (agent: string, review: Review): readonly string[] =>
  review && canPost(agent) ? REVIEW_DENY : [];

/** A review session that only its prompt keeps from posting: its agent takes no deny rules. */
export const promptGuarded = (agent: string, review: Review) => Boolean(review) && !canPost(agent);

/** What the CLI and the app say of a review session that only its prompt guards. */
export const PROMPT_ONLY = 'guarded by its prompt only (no deny rules for this agent)';
