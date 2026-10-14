import type { Runner } from '../lib/process.js';
import type { JsonRead } from '../lib/run-json.js';
import { createComment, deleteComment } from './bitbucket-drafts.js';
import { myDrafts, readPr } from './bitbucket-pr.js';
import type { PrDraft } from './reader.js';

type Failed = Extract<JsonRead<unknown>, { ok: false }>;

// Bitbucket's API cannot publish a pending comment, so each is posted again without `--pending`,
// same text and anchor, and its pending copy deleted. Nothing here approves, requests changes,
// merges or declines (ADR-0024).

/**
 * The order drafts are posted in: the summary, then inline comments, then replies, each after the
 * draft it answers when that is pending too.
 */
function postingOrder(drafts: PrDraft[]): PrDraft[] {
  const byId = new Map(drafts.map((d) => [d.id, d]));
  const depth = (d: PrDraft) => {
    let n = 0;
    for (
      let up = d.replyTo && byId.get(d.replyTo);
      up && n < 100;
      up = up.replyTo && byId.get(up.replyTo)
    )
      n++;
    return n;
  };
  const rank = (d: PrDraft) => (d.replyTo ? 2 + depth(d) : d.path === null ? 0 : 1);
  return [...drafts].sort((a, b) => rank(a) - rank(b));
}

/** Posts my pending comments on the PR and deletes each pending copy; how many were posted. */
export async function publishBitbucket(
  run: Runner,
  repo: string,
  number: number,
): Promise<JsonRead<{ published: number }>> {
  const read = await readPr(run, repo, number);
  if (!read.ok) return read;
  const drafts = postingOrder(myDrafts(read.value.pr, read.value.me));
  // A reply to a draft posted just now answers the posted comment, not its deleted pending copy.
  const postedAs = new Map<string, string>();
  let published = 0;
  const stopped = (step: string, read: Failed): Failed => ({
    ...read,
    detail: `${published} of ${drafts.length} drafts posted; ${step} failed${read.detail ? `: ${read.detail}` : ''}`,
  });
  for (const d of drafts) {
    const replyTo = d.replyTo && (postedAs.get(d.replyTo) ?? d.replyTo);
    const input = replyTo
      ? { text: d.body, replyTo }
      : {
          text: d.body,
          ...(d.path ? { path: d.path } : {}),
          ...(d.line === null ? {} : { line: d.line }),
        };
    const made = await createComment(run, repo, number, input, false);
    if (!made.ok) return stopped(`posting draft ${d.id}`, made);
    published++;
    postedAs.set(d.id, made.value.id);
    const gone = await deleteComment(run, repo, number, d.id);
    if (!gone.ok) return stopped(`deleting the pending copy of ${d.id}`, gone);
  }
  return { ok: true, value: { published } };
}
