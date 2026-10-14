import type { PrDraft } from '@mesa/core';
import { counted, PR_CLIS } from '@mesa/core/browser';
import { ExternalLink as ExternalIcon } from 'lucide-react';
import { ExternalLink } from '@/components/ExternalLink';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import type { PrRef } from '@/lib/client/prs';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { PrDetailPanel } from './PrDetailPanel';
import { PrStatusPanel } from './PrStatusPanel';

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
  },
) {
  const show = useCommand('prs.show', { project: props.project, number: props.number });
  const run = useRun();
  const pr = show.data;
  if (!pr) return <Muted>{show.error ? show.error.message : 'Reading the pull request...'}</Muted>;
  // A draft never changes the Reviews list, so only this PR is read again.
  const discard = async (draft: PrDraft) => {
    if (await run('prs.discard', { project: pr.project, number: pr.number, id: draft.id }))
      await show.refresh();
  };
  const checks = pr.checks ? CHECK_LABEL[pr.checks] : undefined;
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
      <PrStatusPanel pr={pr} />
      <PrDetailPanel pr={pr} onDiscard={discard} tab={props.tab} onTab={props.onTab} />
    </div>
  );
}
