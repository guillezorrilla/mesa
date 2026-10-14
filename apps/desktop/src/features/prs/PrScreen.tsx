import type { PrDraft } from '@mesa/core';
import { PR_CLIS } from '@mesa/core/browser';
import { ExternalLink } from 'lucide-react';
import { Muted } from '@/components/Muted';
import type { PrRef } from '@/lib/client/prs';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { PrDetailPanel } from './PrDetailPanel';
import { PrStatusPanel } from './PrStatusPanel';
import { useSharedPrs } from './usePrs';

const CHECK_LABEL = {
  passing: { label: 'Checks pass', dot: 'bg-state-idle' },
  failing: { label: 'Checks failing', dot: 'bg-state-failed' },
  pending: { label: 'Checks running', dot: 'bg-state-waiting' },
} as const;

/**
 * One pull request, opened from a Reviews list: where it stands for me in one sentence with the
 * next step, then my comments, my Pending drafts and its files. Read when it opens.
 */
export function PrScreen(props: PrRef) {
  const show = useCommand('prs.show', { project: props.project, number: props.number });
  const run = useRun();
  const shared = useSharedPrs();
  const pr = show.data;
  if (!pr) return <Muted>{show.error ? show.error.message : 'Reading the pull request...'}</Muted>;
  const discard = async (draft: PrDraft) => {
    if (await run('prs.discard', { project: pr.project, number: pr.number, id: draft.id })) {
      await show.refresh();
      void shared?.list.refresh();
    }
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
        <a
          className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open on {PR_CLIS[pr.provider].name}
          <ExternalLink aria-hidden className="size-3" />
        </a>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-balance font-semibold text-xl tracking-tight">
          {pr.title} <span className="font-normal text-muted-foreground">#{pr.number}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
          <span className="text-foreground">{pr.author}</span>
          <span className="tabular-nums">
            <span className="text-state-idle">+{pr.additions}</span>{' '}
            <span className="text-state-failed">-{pr.deletions}</span> · {pr.files.length}{' '}
            {pr.files.length === 1 ? 'file' : 'files'}
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
      <PrDetailPanel pr={pr} onDiscard={discard} />
    </div>
  );
}
