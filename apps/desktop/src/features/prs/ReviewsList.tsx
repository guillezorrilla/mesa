import type { PrList, PrSetupRow } from '@mesa/core';
import { PR_CLIS } from '@mesa/core/browser';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';
import { PullRequestRow } from './PullRequestRow';
import { actionable, type PrGrouping, prGroups } from './prGroups';

const PROVIDER = { github: 'GH', bitbucket: 'BB' } as const;

/**
 * The Reviews list, grouped by project (collapsible, most urgent first) or by status, with a Set
 * up row for a project whose CLI is not ready and a quiet line for a project that failed to read.
 */
export function ReviewsList(props: {
  list: PrList;
  by: PrGrouping;
  onSetup: (row: PrSetupRow) => void;
  now: number;
}) {
  const [closed, setClosed] = useState<string[]>([]);
  const groups = prGroups(props.list, props.by);
  const quiet = props.by === 'project' ? props.list.quiet : [];
  const byStatus = props.by === 'status';
  return (
    <div data-testid="reviews-list" className="space-y-3">
      {groups.map((group) => {
        const open = byStatus || !closed.includes(group.key);
        const toAct = group.prs.filter(actionable).length;
        return (
          <section key={group.key} data-testid="pr-group">
            <button
              type="button"
              aria-expanded={open}
              disabled={byStatus}
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs font-semibold text-muted-foreground"
              onClick={() =>
                setClosed((last) =>
                  last.includes(group.key)
                    ? last.filter((key) => key !== group.key)
                    : [...last, group.key],
                )
              }
            >
              {!byStatus && (
                <ChevronDown
                  aria-hidden
                  className={cn('size-3 transition-transform', !open && '-rotate-90')}
                />
              )}
              <span>{group.title}</span>
              {group.provider && !byStatus && (
                <span className="font-mono text-[10px] font-medium opacity-70">
                  {PROVIDER[group.provider]}
                </span>
              )}
              <span className="ml-auto font-medium tabular-nums">
                {byStatus ? group.prs.length : toAct || ''}
              </span>
            </button>
            {open && (
              <div className="space-y-0.5">
                {group.blocked && (
                  <button
                    type="button"
                    data-testid="pr-setup-row"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => group.blocked && props.onSetup(group.blocked)}
                  >
                    Connect {group.blocked.provider ? PR_CLIS[group.blocked.provider].name : 'it'}{' '}
                    to see PRs
                    <span className="ml-auto font-semibold text-state-working">Set up</span>
                  </button>
                )}
                {group.prs.map((pr) => (
                  <PullRequestRow
                    key={`${pr.project}#${pr.number}`}
                    pr={pr}
                    showProject={byStatus}
                    now={props.now}
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
