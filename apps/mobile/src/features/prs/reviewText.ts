import { BUCKET_LABELS, type PhonePrDetail } from '@mesa/core/phone';

/** The review's sentence and its one action: open the live review session, else start one. */
export function reviewText(pr: Pick<PhonePrDetail, 'bucket' | 'drafts' | 'review'>) {
  const drafts = pr.drafts.length;
  const waiting = drafts
    ? ` ${drafts} draft ${drafts === 1 ? 'comment waits' : 'comments wait'} for you to submit.`
    : '';
  if (pr.review)
    return {
      say: `A review session is ${pr.review.working ? 'at work' : 'open and idle'}, ${pr.review.mode === 'post' ? 'posting its comments' : 'leaving drafts'}.${waiting}`,
      action: 'Open the review session',
    };
  const bucket = BUCKET_LABELS[pr.bucket as keyof typeof BUCKET_LABELS] ?? 'Not for you';
  return {
    say: `${bucket}.${waiting}`,
    action: pr.bucket === 'updated' || pr.bucket === 'waiting' ? 'Re-review...' : 'Start review...',
  };
}
