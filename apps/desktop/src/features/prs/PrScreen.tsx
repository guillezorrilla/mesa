import type { PrDetail, PrDraft, TreeRow } from '@mesa/core';
import {
  canPost,
  counted,
  PR_CLIS,
  PROMPT_ONLY,
  promptGuarded,
  reviewLabel,
} from '@mesa/core/browser';
import { ExternalLink as ExternalIcon } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { ExternalLink } from '@/components/ExternalLink';
import { Muted } from '@/components/Muted';
import { StartProgress } from '@/components/StartProgress';
import { Stat } from '@/components/Stat';
import type { PrRef } from '@/lib/client/prs';
import { useCommand, useRun } from '@/lib/useCommand';
import { useNavigate } from '@/lib/useNavigate';
import { cn } from '@/lib/utils';
import { PrDetailPanel } from './PrDetailPanel';
import { PrStatusPanel } from './PrStatusPanel';
import { ReviewStartButton } from './ReviewStartButton';
import { reviewSessionsOf } from './reviewSessions';
import { useStartReview } from './useStartReview';

// The states a review session can be started from; done and drafts-waiting have their own step.
const START_LABEL: Partial<Record<PrDetail['bucket'], 'Start review' | 'Re-review'>> = {
  need: 'Start review',
  updated: 'Re-review',
  waiting: 'Re-review',
};

const CHECK_LABEL = {
  passing: { label: 'Checks pass', dot: 'bg-state-idle' },
  failing: { label: 'Checks failing', dot: 'bg-state-failed' },
  pending: { label: 'Checks running', dot: 'bg-state-waiting' },
} as const;

/**
 * One pull request, opened from a Reviews list: where it stands for me in one sentence with the
 * next step, then my comments, my Pending drafts and its files. Read when it opens.
 */
export function PrScreen(
  props: PrRef & {
    /** The detail tab last picked on this PR, kept by the app. */
    tab?: string;
    onTab?: (tab: string) => void;
    /** The board's sessions: a live review session of this PR turns Start into Open review. */
    sessions?: readonly TreeRow[];
    /** The project's agent: only Claude review sessions may post (#803's guard). */
    agent?: string | null;
  },
) {
  const show = useCommand('prs.show', { project: props.project, number: props.number });
  const run = useRun();
  const navigate = useNavigate();
  const pr = show.data;
  const review = useStartReview({ project: props.project, number: props.number });
  // The draft a Discard click asks about: it is deleted on the provider, with no undo.
  const [discarding, setDiscarding] = useState<PrDraft>();
  if (!pr) return <Muted>{show.error ? show.error.message : 'Reading the pull request...'}</Muted>;
  // A draft never changes the Reviews list, so only this PR is read again.
  const discard = async (draft: PrDraft) => {
    setDiscarding(undefined);
    if (await run('prs.discard', { project: pr.project, number: pr.number, id: draft.id }))
      await show.refresh();
  };
  const checks = pr.checks ? CHECK_LABEL[pr.checks] : undefined;
  const open = (id: string) => navigate?.({ kind: 'session', id });
  const reviews = reviewSessionsOf(props.sessions ?? [], pr);
  const label = START_LABEL[pr.bucket];
  // One step: `mesa prs start` reads the PR, checks out its head and opens the session at once.
  const step =
    pr.bucket === 'need'
      ? 'Read the PR and check out its head'
      : 'Read the PR and your last comments, and check out its new head';
  const action = label && !review.steps && (
    <ReviewStartButton
      label={label}
      live={reviews.live?.id}
      noPost={
        canPost(props.agent)
          ? undefined
          : props.agent === undefined
            ? 'Loading project'
            : `Post now needs Claude; ${pr.project} reviews with ${props.agent ?? 'no agent'}.`
      }
      onStart={(post) => void review.start(post, step)}
      onOpen={open}
    />
  );
  const last = reviews.all.at(-1);
  return (
    <div data-testid="pr-screen" className="max-w-3xl space-y-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        <span>{pr.project}</span>
        <span>·</span>
        <span className="font-mono">
          {pr.branch} {'->'} {pr.base}
        </span>
        <ExternalLink
          className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          href={pr.url}
        >
          Open on {PR_CLIS[pr.provider].name}
          <ExternalIcon aria-hidden className="size-3" />
        </ExternalLink>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-balance font-semibold text-xl tracking-tight">
          {pr.title} <span className="font-normal text-muted-foreground">#{pr.number}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
          <span className="text-foreground">{pr.author}</span>
          <span className="tabular-nums">
            <Stat added={pr.additions} removed={pr.deletions} className="font-sans text-sm" /> ·{' '}
            {counted(pr.files.length, 'file')}
          </span>
          {checks && (
            <span className="inline-flex items-center gap-1.5">
              <span className={cn('size-1.5 rounded-full', checks.dot)} />
              {checks.label}
            </span>
          )}
        </div>
      </div>
      {last && (
        <p data-testid="review-label" className="text-muted-foreground text-xs">
          {last.review && reviewLabel(last.review)}
          {last.alive ? ' · running' : ''}
          {promptGuarded(last.agent, last.review) && ` · ${PROMPT_ONLY}`}
        </p>
      )}
      <PrStatusPanel pr={pr} action={action} />
      {review.note && <Muted>{review.note}</Muted>}
      {review.steps && (
        <StartProgress
          title={`Starting the review of #${pr.number}`}
          steps={review.steps}
          session={review.session}
          onBack={review.reset}
          onSession={open}
        />
      )}
      <PrDetailPanel pr={pr} onDiscard={setDiscarding} tab={props.tab} onTab={props.onTab} />
      {discarding && (
        <ActionDialog
          testId="discard-draft-dialog"
          title="Discard this draft?"
          description={`It is deleted on ${PR_CLIS[pr.provider].name} and cannot be restored.`}
          submit={{
            label: 'Discard draft',
            testId: 'confirm-discard-draft',
            disabled: false,
            variant: 'destructive',
          }}
          onSubmit={() => discard(discarding)}
          onCancel={() => setDiscarding(undefined)}
        />
      )}
    </div>
  );
}
