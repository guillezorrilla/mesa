import type { Bucket, PrDetail } from '@mesa/core';
import { counted, PR_CLIS, prStatus, timeAgo } from '@mesa/core/browser';
import { Check, Clock, ExternalLink, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PR_TONE } from './prTone';

/** What the callout says: its icon, sentence and optional second line. */
type Status = { Icon: typeof Eye; say: string; sub?: string };

/** "since your review 2d ago", or just "since your review" when I never left one. */
const sinceReview = (pr: PrDetail, now: number) =>
  `since your review${pr.since.lastWord ? ` ${timeAgo(pr.since.lastWord, now)}` : ''}`;

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
  drafts: (pr) => ({
    Icon: Check,
    say: `${counted(pr.drafts.length, 'draft comment')} ${pr.drafts.length === 1 ? 'is' : 'are'} waiting on ${PR_CLIS[pr.provider].name}. Only you can see them.`,
    sub: 'Nothing is posted until you submit.',
  }),
  need: (pr, now) => ({
    Icon: Eye,
    say: `${pr.author} asked for your review.`,
    sub: `Updated ${timeAgo(pr.updatedAt, now)}.`,
  }),
  updated: (pr, now) => ({ Icon: RefreshCw, say: `${news(pr)} ${sinceReview(pr, now)}.` }),
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
export function PrStatusPanel(props: { pr: PrDetail }) {
  const { pr } = props;
  const status = prStatus(pr);
  const { Icon, say, sub } = STATUS[status](pr, Date.now());
  const tone = PR_TONE[status];
  const { resolved, threads } = pr.since;
  return (
    <div
      data-testid="pr-status"
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl px-5 py-4',
        tone.box,
      )}
    >
      <span className={cn('grid size-8 place-items-center rounded-full bg-card', tone.text)}>
        <Icon aria-hidden className="size-4" />
      </span>
      <p className="font-medium">{say}</p>
      <div className="row-span-2 flex items-center gap-2">
        {status === 'drafts' && (
          <Button asChild size="sm">
            <a href={pr.url} target="_blank" rel="noopener noreferrer">
              {PR_CLIS[pr.provider].submit}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>
      {sub && <p className="col-start-2 text-muted-foreground text-sm">{sub}</p>}
      {status === 'updated' && threads > 0 && (
        <div className="col-start-2 flex items-center gap-2.5 text-muted-foreground text-xs tabular-nums">
          <span className="h-1.5 w-44 overflow-hidden rounded-full bg-card">
            <span
              className="block h-full bg-state-idle"
              style={{ width: `${(resolved / threads) * 100}%` }}
            />
          </span>
          {resolved} of your {counted(threads, 'thread')} resolved
        </div>
      )}
    </div>
  );
}
