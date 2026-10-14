import { z } from 'zod';
import type { Runner } from '../lib/process.js';
import type { JsonRead } from '../lib/run-json.js';
import { ghGraphql, repoVars } from './github-graphql.js';
import { Nodes, SUMMARY_PREFIX, summaryDraft } from './github-pr.js';
import type { PrProviderApi } from './reader.js';

// Every write lands in my pending review, which only I see until I submit it on GitHub. None of
// these mutations takes a review event, so nothing here can post, approve or submit (ADR-0024).

// The PR and my pending review, if any, with its draft comments: what draft writes into and what
// discard checks an id against.
// ponytail: a pending review's first 100 comments; a review with more drafts than that is unlikely.
const PENDING = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      id
      pending: reviews(states: PENDING, first: 1) {
        nodes { id body comments(first: 100) { nodes { id } } }
      }
    }
  }
}`;

// A summary written before any other draft starts the review with it: GitHub refuses to give a
// body to a pending review that has none ("Could not edit a review with a missing body").
const START = `mutation($pr: ID!, $body: String) {
  addPullRequestReview(input: {pullRequestId: $pr, body: $body}) { pullRequestReview { id body } }
}`;

const INLINE = `mutation($review: ID!, $path: String!, $line: Int!, $body: String!) {
  addPullRequestReviewThread(input: {pullRequestReviewId: $review, path: $path, line: $line, side: RIGHT, body: $body}) {
    thread { comments(first: 1) { nodes { id path line body } } }
  }
}`;

const REPLY = `mutation($review: ID!, $thread: ID!, $body: String!) {
  addPullRequestReviewThreadReply(input: {pullRequestReviewId: $review, pullRequestReviewThreadId: $thread, body: $body}) {
    comment { id path line body }
  }
}`;

const SUMMARY = `mutation($review: ID!, $body: String!) {
  updatePullRequestReview(input: {pullRequestReviewId: $review, body: $body}) {
    pullRequestReview { id body comments { totalCount } }
  }
}`;

// GitHub deletes a pending review left with no body and no comments itself, so the payload names
// nothing that may be gone.
const DELETE_COMMENT = `mutation($id: ID!) {
  deletePullRequestReviewComment(input: {id: $id}) { clientMutationId }
}`;

// Deletes a review only while it is pending: what clearing the summary of an otherwise empty one leaves.
const DELETE_EMPTY = `mutation($review: ID!) {
  deletePullRequestReview(input: {pullRequestReviewId: $review}) { pullRequestReview { id } }
}`;

const Review = z.object({ id: z.string(), body: z.string() });
const Comment = z.object({
  id: z.string(),
  path: z.string(),
  line: z.number().int().nullable(),
  body: z.string(),
});
const Left = z.object({
  id: z.string(),
  body: z.string(),
  comments: z.object({ totalCount: z.number().int() }),
});

const PendingRes = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        id: z.string(),
        pending: Nodes(Review.extend({ comments: Nodes(z.object({ id: z.string() })) })),
      }),
    }),
  }),
});
type Pending = z.infer<typeof PendingRes>['data']['repository']['pullRequest'];
const StartRes = z.object({
  data: z.object({ addPullRequestReview: z.object({ pullRequestReview: Review }) }),
});
const InlineRes = z.object({
  data: z.object({
    addPullRequestReviewThread: z.object({ thread: z.object({ comments: Nodes(Comment) }) }),
  }),
});
const ReplyRes = z.object({
  data: z.object({ addPullRequestReviewThreadReply: z.object({ comment: Comment }) }),
});
const SummaryRes = z.object({
  data: z.object({ updatePullRequestReview: z.object({ pullRequestReview: Left }) }),
});
const DeleteRes = z.object({
  data: z.object({ deletePullRequestReviewComment: z.object({}).loose() }),
});
const DeleteEmptyRes = z.object({ data: z.object({ deletePullRequestReview: z.unknown() }) });

/** The PR's id and my pending review on it, if I have one. */
async function pendingOf(run: Runner, repo: string, number: number): Promise<JsonRead<Pending>> {
  const read = await ghGraphql(
    run,
    PENDING,
    { strings: repoVars(repo), ints: { number } },
    PendingRes,
  );
  return read.ok ? { ok: true, value: read.value.data.repository.pullRequest } : read;
}

/** My pending review on the PR, started (with no event, so it stays pending) when I have none. */
async function pendingReview(
  run: Runner,
  repo: string,
  number: number,
  summary: string | undefined,
): Promise<JsonRead<z.infer<typeof Review> & { started: boolean }>> {
  const read = await pendingOf(run, repo, number);
  if (!read.ok) return read;
  const mine = read.value.pending.nodes[0];
  if (mine) return { ok: true, value: { id: mine.id, body: mine.body, started: false } };
  const vars = { pr: read.value.id, ...(summary === undefined ? {} : { body: summary }) };
  const started = await ghGraphql(run, START, { strings: vars }, StartRes);
  return started.ok
    ? {
        ok: true,
        value: { ...started.value.data.addPullRequestReview.pullRequestReview, started: true },
      }
    : started;
}

/** Leaves one draft in my pending review: inline, a reply, or the review's summary. */
export const draftGithub: PrProviderApi['draft'] = async (run, repo, number, input) => {
  const summary = !(input.path && input.line) && !input.replyTo;
  const pending = await pendingReview(run, repo, number, summary ? input.text : undefined);
  if (!pending.ok) return pending;
  const review = pending.value;
  if (input.path && input.line) {
    const read = await ghGraphql(
      run,
      INLINE,
      {
        strings: { review: review.id, path: input.path, body: input.text },
        ints: { line: input.line },
      },
      InlineRes,
    );
    if (!read.ok) return read;
    const [c] = read.value.data.addPullRequestReviewThread.thread.comments.nodes;
    return c ? { ok: true, value: c } : { ok: false, reason: 'invalid-data' };
  }
  if (input.replyTo) {
    const read = await ghGraphql(
      run,
      REPLY,
      { strings: { review: review.id, thread: input.replyTo, body: input.text } },
      ReplyRes,
    );
    if (!read.ok) return read;
    const c = read.value.data.addPullRequestReviewThreadReply.comment;
    return { ok: true, value: { ...c, replyTo: input.replyTo } };
  }
  if (review.started) return { ok: true, value: summaryDraft(review) };
  if (!review.body.trim())
    return {
      ok: false,
      reason: 'failed',
      detail:
        'GitHub cannot add a summary to a pending review that has none; write it when you submit on GitHub',
    };
  const body = `${review.body}\n\n${input.text}`;
  const read = await ghGraphql(run, SUMMARY, { strings: { review: review.id, body } }, SummaryRes);
  if (!read.ok) return read;
  return {
    ok: true,
    value: summaryDraft(read.value.data.updatePullRequestReview.pullRequestReview),
  };
};

/** Removes one draft: a comment from my pending review, or the summary (`review:<id>`) cleared. */
export const discardGithub: PrProviderApi['discard'] = async (run, repo, number, id) => {
  // Only a draft of mine on this PR: a posted comment or a submitted review is never touched.
  const mine = await pendingOf(run, repo, number);
  if (!mine.ok) return mine;
  const pending = mine.value.pending.nodes[0];
  const isPending = id.startsWith(SUMMARY_PREFIX)
    ? pending?.id === id.slice(SUMMARY_PREFIX.length)
    : Boolean(pending?.comments.nodes.some((c) => c.id === id));
  if (!isPending)
    return {
      ok: false,
      reason: 'failed',
      detail: `${id} is not a pending draft of yours on #${number}`,
    };
  if (!id.startsWith(SUMMARY_PREFIX)) {
    const read = await ghGraphql(run, DELETE_COMMENT, { strings: { id } }, DeleteRes);
    return read.ok ? { ok: true, value: { id } } : read;
  }
  const review = id.slice(SUMMARY_PREFIX.length);
  const read = await ghGraphql(run, SUMMARY, { strings: { review, body: '' } }, SummaryRes);
  if (!read.ok) return read;
  // With no comments either, nothing is left to submit: remove the pending review.
  if (!read.value.data.updatePullRequestReview.pullRequestReview.comments.totalCount) {
    const dropped = await ghGraphql(run, DELETE_EMPTY, { strings: { review } }, DeleteEmptyRes);
    if (!dropped.ok) return dropped;
  }
  return { ok: true, value: { id } };
};
