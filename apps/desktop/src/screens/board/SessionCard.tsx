import type { TreeRow } from '@mesa/core';
import { projectLabel, sessionLabel } from '@mesa/core/browser';
import { ArrowDown, ArrowUp, Download, SquareTerminal } from 'lucide-react';
import { StateBadge } from '@/components/StateBadge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { exited } from './rows';
import type { RowActions } from './SessionRow';
import { WorkflowSelect } from './WorkflowSelect';

export function SessionCard(props: {
  row: TreeRow;
  compact: boolean;
  acting: boolean;
  actions: RowActions;
  onSelect?: (id: string) => void;
  onMove?: (id: string, direction: -1 | 1) => void;
}) {
  const { row, actions } = props;
  const relations = row.managed
    ? [
        row.parent && `Child of ${row.parent}`,
        row.after && `After ${row.after}`,
        row.handoffFrom && `Handed off from ${row.handoffFrom}`,
        row.resumedFrom && `Resumed from ${row.resumedFrom}`,
      ].filter(Boolean)
    : [];
  return (
    <Card data-testid="session-card" className={props.compact ? 'gap-2 p-3' : 'gap-3 p-4'}>
      <div className="flex min-w-0 items-start justify-between gap-2">
        <button
          type="button"
          className="min-w-0 truncate text-left font-medium hover:underline"
          onClick={() => props.onSelect?.(row.id)}
          disabled={!props.onSelect}
        >
          {sessionLabel(row)}
        </button>
        <StateBadge state={row.lastState.state} />
      </div>
      <p className="truncate text-muted-foreground text-xs">
        {projectLabel(row.project)} / {row.agent}
      </p>
      {row.managed && row.goal && <p className="line-clamp-2 text-sm">{row.goal}</p>}
      {relations.length > 0 && (
        <p data-testid="session-relations" className="text-muted-foreground text-xs">
          {relations.join(' / ')}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {row.managed ? (
          <>
            <WorkflowSelect
              id={row.id}
              status={row.workflowStatus}
              disabled={props.acting}
              onChange={(status) => actions.workflow(row.id, status)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => actions.embed(row.id)}
              disabled={exited(row)}
            >
              <SquareTerminal aria-hidden /> Terminal
            </Button>
            {props.onMove && (
              <>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${row.id} up`}
                  onClick={() => props.onMove?.(row.id, -1)}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Move ${row.id} down`}
                  onClick={() => props.onMove?.(row.id, 1)}
                >
                  <ArrowDown aria-hidden />
                </Button>
              </>
            )}
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => actions.adopt(row.agentSessionId, row.project ?? undefined)}
            disabled={props.acting}
          >
            <Download aria-hidden /> Adopt
          </Button>
        )}
      </div>
    </Card>
  );
}
