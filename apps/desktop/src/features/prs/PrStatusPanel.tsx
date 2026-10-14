import type { Bucket, PrDetail } from '@mesa/core';
import { PR_CLIS, timeAgo } from '@mesa/core/browser';
import { Check, Clock, ExternalLink, Eye, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Tone = 'ready' | 'need' | 'updated' | 'quiet';
const TONE: Record<Tone, { box: string; icon: string }> = {
  ready: { box: 'bg-state-idle/10', icon: 'text-state-idle' },
  need: { box: 'bg-state-working/10', icon: 'text-state-working' },
  updated: { box: 'bg-state-waiting/15', icon: 'text-state-waiting' },
  quiet: { box: 'bg-muted', icon: 'text-muted-foreground' },
};

/** What the callout says: its tone, icon, sentence and optional second line. */
type Status = { tone: Tone; Icon: typeof Eye; say: string; sub?: string };

/** "since your review 2d ago", or just "since your review" when I never left one. */
const sinceReview = (pr: PrDetail, now: number) =>
  `since your review${pr.since.lastWord ? ` ${timeAgo(pr.since.lastWord, now)}` : ''}`;

/** What the author did since my last review: "pushed 3 commits and replied 2 times". */
function news(pr: PrDetail) {
  const parts = [
    ...(pr.since.commits ? [`pushed ${count(pr.since.commits, 'commit')}`] : []),
    ...(pr.since.replies ? [`replied ${count(pr.since.replies, 'time')}`] : []),
  ];
  return parts.length ? `${pr.author} ${parts.join(' and ')}` : 'There is news';
}

/** One sentence per bucket, with its age. */
const STATUS: Record<Bucket, (pr: PrDetail, now: number) => Status> = {
  need: (pr, now) => ({
    tone: 'need',
    Icon: Eye,
    say: `${pr.author} asked for your review.`,
    sub: `Updated ${timeAgo(pr.updatedAt, now)}.`,
  }),
  updated: (pr, now) => ({
    tone: 'updated',
    Icon: RefreshCw,
    say: `${news(pr)} ${sinceReview(pr, now)}.`,
  }),
  waiting: (pr, now) => ({
    tone: 'quiet',
    Icon: Clock,
    say: `Nothing new ${sinceReview(pr, now)}.`,
    sub: `It moves to Updated as soon as ${pr.author} pushes or replies.`,
  }),
  done: () => ({
    tone: 'quiet',
    Icon: Check,
    say: 'Nothing to do: you approved it, or it is merged or closed.',
  }),
  other: () => ({ tone: 'quiet', Icon: Eye, say: 'Your review is not requested on this PR.' }),
};

/**
 * Where the PR stands, in one sentence, with the one thing to do next. Pending drafts come first:
 * they wait on me to submit them on the provider. `action` is the review button (#792).
 */
export function PrStatusPanel(props: { pr: PrDetail; action?: ReactNode; now?: number }) {
  const { pr } = props;
  const now = props.now ?? Date.now();
  const drafts = pr.drafts.length;
  const { tone, Icon, say, sub }: Status = drafts
    ? {
        tone: 'ready',
        Icon: Check,
        say: `${count(drafts, 'draft comment')} ${drafts === 1 ? 'is' : 'are'} waiting on ${PR_CLIS[pr.provider].name}. Only you can see them.`,
        sub: 'Nothing is posted until you submit.',
      }
    : STATUS[pr.bucket](pr, now);
  const { resolved, threads } = pr.since;
  return (
    <div
      data-testid="pr-status"
      className={cn(
        'grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-xl px-5 py-4',
        TONE[tone].box,
      )}
    >
      <span className={cn('grid size-8 place-items-center rounded-full bg-card', TONE[tone].icon)}>
        <Icon aria-hidden className="size-4" />
      </span>
      <p className="font-medium">{say}</p>
      <div className="row-span-2 flex items-center gap-2">
        {props.action}
        {drafts > 0 && (
          <Button asChild size="sm">
            <a href={pr.url} target="_blank" rel="noopener noreferrer">
              {pr.provider === 'github' ? 'Submit on GitHub' : 'Finish review in Bitbucket'}
              <ExternalLink aria-hidden />
            </a>
          </Button>
        )}
      </div>
      {sub && <p className="col-start-2 text-muted-foreground text-sm">{sub}</p>}
      {!drafts && pr.bucket === 'updated' && threads > 0 && (
        <div className="col-start-2 flex items-center gap-2.5 text-muted-foreground text-xs tabular-nums">
          <span className="h-1.5 w-44 overflow-hidden rounded-full bg-card">
            <span
              className="block h-full bg-state-idle"
              style={{ width: `${(resolved / threads) * 100}%` }}
            />
          </span>
          {resolved} of your {count(threads, 'thread')} resolved
        </div>
      )}
    </div>
  );
}
