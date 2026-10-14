import type { PrDetail } from '@mesa/core';
import { PR_CLIS } from '@mesa/core/browser';
import { Check, Clock, ExternalLink, Eye, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);

/** What the author did since my last review, as one clause: "pushed 3 commits and replied twice". */
function news(pr: PrDetail) {
  const parts = [
    ...(pr.since.commits ? [`pushed ${count(pr.since.commits, 'commit')}`] : []),
    ...(pr.since.replies ? [`replied ${times(pr.since.replies)}`] : []),
  ];
  return parts.length
    ? `${pr.author} ${parts.join(' and ')} since your review.`
    : 'There is news since your review.';
}

type Tone = 'ready' | 'need' | 'updated' | 'quiet';
const TONE: Record<Tone, { box: string; icon: string }> = {
  ready: { box: 'bg-state-idle/10', icon: 'text-state-idle' },
  need: { box: 'bg-state-working/10', icon: 'text-state-working' },
  updated: { box: 'bg-state-waiting/15', icon: 'text-state-waiting' },
  quiet: { box: 'bg-muted', icon: 'text-muted-foreground' },
};

/**
 * Where the PR stands, in one sentence, with the one thing to do next. Pending drafts come first:
 * they wait on me to submit them on the provider. `action` is the review button (#792).
 */
export function PrStatusPanel(props: { pr: PrDetail; action?: ReactNode }) {
  const { pr } = props;
  const provider = PR_CLIS[pr.provider].name;
  const drafts = pr.drafts.length;
  const [tone, Icon, say, sub, button]: [Tone, typeof Eye, string, string?, ReactNode?] = drafts
    ? [
        'ready',
        Check,
        `${count(drafts, 'draft comment')} ${drafts === 1 ? 'is' : 'are'} waiting on ${provider}. Only you can see them.`,
        'Nothing is posted until you submit.',
        <Button key="submit" asChild size="sm">
          <a href={pr.url} target="_blank" rel="noopener noreferrer">
            {pr.provider === 'github' ? 'Submit on GitHub' : 'Finish review in Bitbucket'}
            <ExternalLink aria-hidden />
          </a>
        </Button>,
      ]
    : pr.bucket === 'need'
      ? ['need', Eye, `${pr.author} asked for your review.`]
      : pr.bucket === 'updated'
        ? ['updated', RefreshCw, news(pr)]
        : pr.bucket === 'waiting'
          ? [
              'quiet',
              Clock,
              'Nothing new since your review.',
              `It moves to Updated as soon as ${pr.author} pushes or replies.`,
            ]
          : pr.bucket === 'done'
            ? ['quiet', Check, 'Nothing to do: you approved it, or it is merged or closed.']
            : ['quiet', Eye, 'Your review is not requested on this PR.'];
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
        {button}
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
