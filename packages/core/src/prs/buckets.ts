// The Review bucket (CONTEXT.md): where a PR stands for me, computed from its events alone, the
// same rule for every provider. Judging whether a comment was addressed is a review session's job.

/** need: asked and not reviewed yet; updated: news since my last word; waiting: none; done: approved or closed; other: not for me. */
export type Bucket = 'need' | 'updated' | 'waiting' | 'done' | 'other';

/** What a provider tells Mesa about one PR, every time an ISO timestamp, every person a login. */
export type PrFacts = {
  author: string;
  state: 'open' | 'merged' | 'closed';
  /** My review is requested. */
  requested: boolean;
  reviews: { author: string; state: 'approved' | 'changes' | 'commented'; at: string }[];
  /** Conversation and inline comments, replies included. */
  comments: { author: string; at: string }[];
  commits: string[];
  /** Inline threads: who opened each, and whether it is resolved. */
  threads: { author: string; resolved: boolean }[];
};

/** The listed buckets, most urgent first, each with the heading people read. */
export const BUCKET_LABELS = {
  need: 'Needs your review',
  updated: 'Updated since your review',
  waiting: 'Waiting on the author',
  other: 'Not for you',
} as const satisfies Record<Exclude<Bucket, 'done'>, string>;

/** A listed bucket's place, most urgent first: the order of BUCKET_LABELS. */
export const bucketRank = (bucket: Exclude<Bucket, 'done'>) =>
  Object.keys(BUCKET_LABELS).indexOf(bucket);

/** Where one PR stands for me: my pending drafts waiting to be submitted first, else its bucket. */
export const prStatus = (pr: { bucket: Bucket; drafts: readonly unknown[] }): 'drafts' | Bucket =>
  pr.drafts.length ? 'drafts' : pr.bucket;

/**
 * How far the author got with my threads: with verdicts from a re-review (CONTEXT.md, Comment
 * verdict), the ones addressed or partly addressed; else the ones resolved on the provider.
 */
export function threadProgress(pr: {
  since: Pick<Since, 'resolved' | 'threads'>;
  threads: readonly { verdict?: { state: string } }[];
}): { done: number; of: number; by: 'verdicts' | 'resolved' } {
  const judged = pr.threads.filter((t) => t.verdict);
  return judged.length
    ? {
        done: judged.filter((t) => t.verdict?.state !== 'not').length,
        of: pr.since.threads,
        by: 'verdicts',
      }
    : { done: pr.since.resolved, of: pr.since.threads, by: 'resolved' };
}

/** The bucket asks something of me: a first review, or a look at what changed since mine. */
export const actionable = (bucket: Bucket) => bucket === 'need' || bucket === 'updated';

/**
 * The evidence a row shows: when I last reviewed or commented (null: never), the commits and
 * author replies since, and my threads resolved.
 */
export type Since = {
  lastWord: string | null;
  commits: number;
  replies: number;
  resolved: number;
  threads: number;
};

/** Where a comment sits, as people read it: `path:line`, the file alone, or the review summary. */
export const commentPlace = (c: { path: string | null; line: number | null }) =>
  c.path ? `${c.path}${c.line ? `:${c.line}` : ''}` : 'Review summary';

const latest = (times: string[]) => Math.max(-Infinity, ...times.map((t) => Date.parse(t)));

/** The PR's bucket for `me`, and the evidence behind it. */
export function bucketOf(pr: PrFacts, me: string): { bucket: Bucket; since: Since } {
  const mine = pr.threads.filter((t) => t.author === me);
  const lastWord = latest([
    ...pr.reviews.filter((r) => r.author === me).map((r) => r.at),
    ...pr.comments.filter((c) => c.author === me).map((c) => c.at),
  ]);
  const after = (t: string) => Date.parse(t) > lastWord;
  const since: Since = {
    lastWord: lastWord === -Infinity ? null : new Date(lastWord).toISOString(),
    commits: pr.commits.filter(after).length,
    replies: pr.comments.filter((c) => c.author === pr.author && after(c.at)).length,
    resolved: mine.filter((t) => t.resolved).length,
    threads: mine.length,
  };
  if (pr.state !== 'open') return { bucket: 'done', since };
  const myReviews = pr.reviews
    .filter((r) => r.author === me)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  // A comment is not a review: asked, I still owe one.
  if (pr.requested && !myReviews.length) return { bucket: 'need', since };
  if (lastWord === -Infinity) return { bucket: 'other', since };
  const myLast = myReviews.at(-1);
  const news = since.commits > 0 || since.replies > 0;
  if (myLast?.state === 'approved' && !news) return { bucket: 'done', since };
  return { bucket: news ? 'updated' : 'waiting', since };
}
