import { z } from 'zod';
import { pendingOf } from './github-draft.js';
import { ghGraphql } from './github-graphql.js';
import type { PrProviderApi } from './reader.js';

// Submits my pending review as a comment review. The event is a literal in the mutation, never a
// variable, so this can only ever comment: never approve or request changes (ADR-0024).
const SUBMIT = `mutation($review: ID!) {
  submitPullRequestReview(input: {pullRequestReviewId: $review, event: COMMENT}) {
    pullRequestReview { id }
  }
}`;

const SubmitRes = z.object({
  data: z.object({
    submitPullRequestReview: z.object({ pullRequestReview: z.object({ id: z.string() }) }),
  }),
});

/** Publishes my pending review on the PR, its summary and comments, as one COMMENT review. */
export const publishGithub: PrProviderApi['publish'] = async (run, repo, number) => {
  const read = await pendingOf(run, repo, number);
  if (!read.ok) return read;
  const pending = read.value.pending.nodes[0];
  if (!pending) return { ok: true, value: { published: 0 } };
  const sent = await ghGraphql(run, SUBMIT, { strings: { review: pending.id } }, SubmitRes);
  if (!sent.ok) return sent;
  const published = pending.comments.nodes.length + (pending.body.trim() ? 1 : 0);
  return { ok: true, value: { published } };
};
