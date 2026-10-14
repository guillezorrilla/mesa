import type { Bucket, PrDetail } from '@mesa/core';
import { counted, PR_CLIS, prStatus, relativeAgo, threadProgress } from '@mesa/core/browser';
import { Check, Clock, ExternalLink, Eye, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PR_TONE } from './prTone';

/** What the callout says: its icon, sentence and optional second line. */
type Status = { Icon: typeof Eye; say: string; sub?: string };

/** "since your review 2d ago", or just "since your review" when I never left one. */
const sinceReview = (pr: PrDetail, now: number) =>
  `since your review${pr.since.lastWord ? ` ${relativeAgo(pr.since.lastWord, now)}` : ''}`;

/** The author's news as one sentence: "Lee pushed 2 commits since your review 3d ago." */
const updatedSay = (pr: PrDetail, now: number) => `${news(pr)} ${sinceReview(pr, now)}.`;

/** What the author did since my last review: "pushed 3 commits and replied 2 times". */
function news(pr: PrDetail) {
  const parts = [
    ...(pr.since.commits ? [`pushed ${counted(pr.since.commits, 'commit')}`] : []),
    ...(pr.since.replies ? [`replied ${counted(pr.since.replies, 'time')}`] : []),
  ];
  return parts.length ? `${pr.author} ${parts.join(' and ')}` : 'There is news';
}

/** One sentence per state (core's prStatus), with its age. */
const STATUS: Record<'drafts' | Bucket, (pr: PrDetail, now: number) => Status> = {
  drafts: (pr, now) => {
    const one = pr.drafts.length === 1;
    return {
      Icon: Check,
      say: `${counted(pr.drafts.length, 'draft comment')} ${one ? 'is' : 'are'} waiting on ${PR_CLIS[pr.provider].name}. Only you can see ${one ? 'it' : 'them'}.`,
      // Drafts never hide what the author did meanwhile.
      sub:
        pr.bucket === 'updated'
          ? `${updatedSay(pr, now)} Nothing is posted until you submit.`
          : 'Nothing is posted until you submit.',
    };
  },
  need: (pr, now) => ({
    Icon: Eye,
    say: `${pr.author} asked for your review.`,
    sub: `Updated ${relativeAgo(pr.updatedAt, now)}.`,
  }),
  updated: (pr, now) => ({ Icon: RefreshCw, say: updatedSay(pr, now) }),
  waiting: (pr, now) => ({
    Icon: Clock,
    say: `Nothing new ${sinceReview(pr, now)}.`,
    sub: `It moves to Updated as soon as ${pr.author} pushes or replies.`,
  }),
  done: () => ({ Icon: Check, say: 'Nothing to do: you approved it, or it is merged or closed.' }),
  other: () => ({ Icon: Eye, say: 'Your review is not requested on this PR.' }),
};

/**
 * Where the PR stands, in one sentence, with the one thing to do next. Pending drafts come first:
 * they wait on me to submit them on the provider.
 */
export function PrStatusPanel(props: {
  pr: PrDetail;
  /** The next step besides submitting drafts: start or open a review session. */
  action?: ReactNode;
}) {
  const { pr } = props;
  const status = prStatus(pr);
  const { Icon, say, sub } = STATUS[status](pr, Date.now());
  const tone = PR_TONE[status];
  const { done, of: threads, by } = threadProgress(pr);
  const doneWord = by === 'verdicts' ? 'addressed or partly' : 'resolved';
  // The actions sit beside the sentence when the panel is wide and under it when it is narrow, so
  // a narrow window never clips them.
  return (
    <div data-testid="pr-status" className={cn('@container rounded-xl', tone.box)}>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-5 py-4 @2xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span className={cn('grid size-8 place-items-center rounded-full bg-card', tone.text)}>
          <Icon aria-hidden className="size-4" />
        </span>
        <p className="font-medium">{say}</p>
        {sub && <p className="col-start-2 text-muted-foreground text-sm">{sub}</p>}
        {pr.bucket === 'updated' && threads > 0 && (
          <div className="col-start-2 flex items-center gap-2.5 text-muted-foreground text-xs tabular-nums">
            <span className="h-1.5 w-44 shrink-0 overflow-hidden rounded-full bg-card">
              <span
                className="block h-full bg-state-idle"
                style={{ width: `${(done / threads) * 100}%` }}
              />
            </span>
            {done} of your {counted(threads, 'thread')} {doneWord}
          </div>
        )}
        {(props.action || status === 'drafts') && (
          <div className="col-start-2 mt-2 flex flex-wrap items-center gap-2 @2xl:col-start-3 @2xl:row-span-2 @2xl:row-start-1 @2xl:mt-0">
            {props.action}
            {status === 'drafts' && (
              <Button asChild size="sm">
                <a href={pr.url} target="_blank" rel="noopener noreferrer">
                  {PR_CLIS[pr.provider].submit}
                  <ExternalLink aria-hidden />
                </a>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
