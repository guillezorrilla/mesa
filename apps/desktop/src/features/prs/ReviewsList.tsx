import type { PrRow, PrSetupRow } from '@mesa/core';
import { actionable, PR_CLIS } from '@mesa/core/browser';
import { ChevronDown } from 'lucide-react';
import { Muted } from '@/components/Muted';
import type { PrRef } from '@/lib/client/prs';
import { cn } from '@/lib/utils';
import { PullRequestRow } from './PullRequestRow';
import { type PrGrouping, prGroups } from './prGroups';
import { prKey } from './prKey';
import { useClosedGroups } from './useGrouping';
import type { Prs } from './usePrs';

const PROVIDER = { github: 'GH', bitbucket: 'BB' } as const;

/**
 * The Reviews list, grouped by project (collapsible, most urgent first) or by status, with a Set
 * up row for a project whose CLI is not ready and a quiet line for a project that failed to read;
 * while the list is read, or when it fails, says so.
 */
export function ReviewsList(props: {
  read: Prs['list'];
  by: PrGrouping;
  onSetup: (row: PrSetupRow) => void;
  onOpen: (pr: PrRow) => void;
  /** The PR whose detail is shown, marked in the list. */
  current?: PrRef;
  /** `project#number` of the PRs a live review session works on (liveReviews). */
  reviewing?: ReadonlySet<string>;
  now: number;
}) {
  const [closed, toggleClosed] = useClosedGroups();
  const list = props.read.data;
  if (!list)
    return (
      <Muted className="px-2">
        {props.read.error ? props.read.error.message : 'Reading pull requests...'}
      </Muted>
    );
  const groups = prGroups(list, props.by);
  const { quiet } = list;
  const byStatus = props.by === 'status';
  return (
    <div data-testid="reviews-list" className="space-y-3">
      {groups.map((group) => {
        const open = byStatus || !closed.includes(group.key);
        const toAct = group.prs.filter((pr) => actionable(pr.bucket)).length;
        const { blocked } = group;
        return (
          <section key={group.key} data-testid="pr-group">
            <button
              type="button"
              aria-expanded={open}
              disabled={byStatus}
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs font-semibold text-muted-foreground"
              onClick={() => toggleClosed(group.key)}
            >
              {!byStatus && (
                <ChevronDown
                  aria-hidden
                  className={cn('size-3 transition-transform', !open && '-rotate-90')}
                />
              )}
              <span>{group.title}</span>
              {group.provider && !group.status && (
                <span className="font-mono text-[10px] font-medium opacity-70">
                  {PROVIDER[group.provider]}
                </span>
              )}
              <span className="ml-auto font-medium tabular-nums">
                {group.status ? group.prs.length : toAct || ''}
              </span>
            </button>
            {open && (
              <div className="space-y-0.5">
                {blocked?.provider && (
                  <button
                    type="button"
                    data-testid="pr-setup-row"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => props.onSetup(blocked)}
                  >
                    Connect {PR_CLIS[blocked.provider].name} to see PRs
                    <span className="ml-auto font-semibold text-state-working">Set up</span>
                  </button>
                )}
                {group.prs.map((pr) => (
                  <PullRequestRow
                    key={prKey(pr)}
                    pr={pr}
                    showProject={byStatus}
                    now={props.now}
                    current={
                      props.current?.project === pr.project && props.current.number === pr.number
                    }
                    reviewing={props.reviewing?.has(prKey(pr))}
                    onOpen={props.onOpen}
                  />
                ))}
                {group.problem && (
                  <Muted size="xs" className="px-2">
                    {group.problem}
                  </Muted>
                )}
              </div>
            )}
          </section>
        );
      })}
      {groups.length === 0 && <Muted className="px-2">No pull requests need you.</Muted>}
      {quiet.length > 0 && (
        <Muted size="xs" className="px-2 pt-2">
          No open PRs for you in {quiet.join(', ')}
        </Muted>
      )}
    </div>
  );
}
