import type { InstructionStatus, ManagedRow, SessionRecord } from '@mesa/core';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { useCall } from '@/lib/useCommand';

/** Native facts for the selected session, read by id only when its details are opened. */
export function SelectedSessionDetails(props: { row: ManagedRow; projectPath?: string }) {
  const call = useCall();
  const [record, setRecord] = useState<SessionRecord & { instructions: InstructionStatus }>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const { row } = props;
  const context = record ? record.context : row.context;
  const cwd =
    record?.cwd ?? row.cwd ?? record?.worktree?.path ?? row.worktree?.path ?? props.projectPath;
  const date = (at: string) => new Date(at).toLocaleString();
  return (
    <>
      <details
        className="relative z-20 shrink-0"
        onToggle={(event) => {
          if (!event.currentTarget.open) return;
          setLoading(true);
          void call('sessions.show', { id: row.id }).then((result) => {
            if (result.ok) {
              setRecord(result.data);
              setError(undefined);
            } else setError(result.error.message);
            setLoading(false);
          });
        }}
      >
        <summary
          aria-label="Session details"
          className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown aria-hidden className="size-3.5" />
        </summary>
        <div
          data-testid="selected-session-details"
          className="absolute left-0 top-full mt-2 w-96 max-w-[calc(100vw-18rem)] rounded-lg border bg-popover p-3 shadow-lg"
        >
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Session ID</dt>
            <dd className="break-all font-mono">{row.id}</dd>
            <dt className="text-muted-foreground">Working Dir</dt>
            <dd className="break-all font-mono">{cwd ?? 'Unknown'}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd>{context?.model ?? 'Unknown'}</dd>
            <dt className="text-muted-foreground">Effort</dt>
            <dd>{context?.effort ?? 'Unknown'}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{row.lastState.state}</dd>
            <dt className="text-muted-foreground">Instructions</dt>
            <dd title={record?.instructions.reason}>
              {record
                ? `${record.instructions.state}: ${record.instructions.reason}`
                : 'Open details to check'}
            </dd>
            <dt className="text-muted-foreground">Created</dt>
            <dd>{date(row.startedAt)}</dd>
            <dt className="text-muted-foreground">Last Activity</dt>
            <dd>{date(row.lastState.at)}</dd>
            <dt className="text-muted-foreground">Context</dt>
            <dd>
              {context ? (
                <>
                  <span>
                    {context.used}% of {context.window.toLocaleString()} tokens
                  </span>
                  <Progress value={Math.min(100, context.used)} className="mt-1 h-1" />
                  <span className="text-muted-foreground">
                    {context.source}, {date(context.at)}
                  </span>
                </>
              ) : (
                'Unknown'
              )}
            </dd>
          </dl>
          {loading && <p className="mt-2 text-xs text-muted-foreground">Reading session...</p>}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </details>
      {context ? (
        <span
          role="progressbar"
          aria-label={`Context window: ${context.used}%`}
          aria-valuenow={Math.min(100, context.used)}
          aria-valuemin={0}
          aria-valuemax={100}
          title={`Transcript reading at ${date(context.at)}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-full p-0.5"
          style={{
            background: `conic-gradient(var(--state-idle) ${Math.min(100, context.used)}%, var(--border) 0)`,
          }}
        >
          <span className="size-full rounded-full bg-card" />
        </span>
      ) : (
        <span
          role="img"
          aria-label="Context window: unknown"
          title="No native context reading yet"
          className="size-4 shrink-0 rounded-full border border-muted-foreground/50"
        />
      )}
    </>
  );
}
