import type { InstructionStatus, ManagedRow, McpTool, SessionRecord } from '@mesa/core';
import { attentionScore, contextPercent, percent } from '@mesa/core/browser';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useCall } from '@/lib/useCommand';
import { contextTone } from '../ContextBar';

/** The ring's colour for each context tone: the Board's context bar's. */
const RING = {
  normal: 'var(--state-idle)',
  amber: 'var(--state-waiting)',
  red: 'var(--state-failed)',
};

/** A configuration status as `state: reason`, once the details are read. */
const statusText = (status?: InstructionStatus) =>
  status ? `${status.state}: ${status.reason}` : 'Open details to check';

/** Native facts for the selected session, read by id only when its details are opened. */
export function SelectedSessionDetails(props: { row: ManagedRow; projectPath?: string }) {
  const call = useCall();
  const [record, setRecord] = useState<
    SessionRecord & { instructions: InstructionStatus; vault: InstructionStatus }
  >();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  // The mesa-vault tools its agent's server lists (ADR-0011); a plain terminal has no agent.
  const [tools, setTools] = useState<{ tools?: McpTool[]; error?: string }>({});
  const { row } = props;
  const agent = row.agent !== 'terminal';
  const context = record ? record.context : row.context;
  const shown = context ? contextPercent(context.used) : 0;
  const tone = context ? contextTone(context.used) : 'normal';
  const cwd =
    record?.cwd ?? row.cwd ?? record?.worktree?.path ?? row.worktree?.path ?? props.projectPath;
  // The other projects it works in (CONTEXT.md, Additional project), each in its worktree.
  const additional = record?.additional ?? row.additional;
  const date = (at: string) => new Date(at).toLocaleString();
  return (
    <>
      <details
        className="relative z-20 shrink-0"
        onToggle={(event) => {
          if (!event.currentTarget.open) return;
          setLoading(true);
          if (agent) {
            void call('vault.tools').then((result) =>
              setTools(result.ok ? { tools: result.data.tools } : { error: result.error.message }),
            );
          }
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
            {additional && (
              <>
                <dt className="text-muted-foreground">Also in</dt>
                <dd data-testid="session-also-in">
                  <ul className="grid gap-1">
                    {additional.map((a) => (
                      <li key={a.project}>
                        {a.project} <span className="break-all font-mono">{a.worktree.path}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Model</dt>
            <dd>{context?.model ?? 'Unknown'}</dd>
            <dt className="text-muted-foreground">Effort</dt>
            <dd>{context?.effort ?? 'Unknown'}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>{row.lastState.state}</dd>
            <dt className="text-muted-foreground">Confidence</dt>
            <dd>{percent(row.lastState.confidence)}</dd>
            <dt className="text-muted-foreground">Attention</dt>
            <dd>{attentionScore(row.attention)}</dd>
            <dt className="text-muted-foreground">Instructions</dt>
            <dd title={record?.instructions.reason}>{statusText(record?.instructions)}</dd>
            <dt className="text-muted-foreground">Vault</dt>
            <dd title={record?.vault.reason}>{statusText(record?.vault)}</dd>
            <dt className="text-muted-foreground">Vault tools</dt>
            <dd data-testid="session-vault-tools">
              {!agent ? (
                'None: a plain terminal runs no agent'
              ) : tools.tools ? (
                <ul className="flex flex-wrap gap-1">
                  {tools.tools.map((tool) => (
                    <li key={tool.name}>
                      <Badge variant="outline" className="font-mono" title={tool.description}>
                        {tool.name}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                (tools.error ?? 'Open details to check')
              )}
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
                    {shown}% of {context.window.toLocaleString()} tokens
                  </span>
                  <Progress value={shown} className="mt-1 h-1" />
                  <span className="text-muted-foreground">
                    {context.source}, {date(context.at)}
                  </span>
                </>
              ) : (
                'Unknown'
              )}
            </dd>
          </dl>
          {loading && (
            <Muted size="xs" className="mt-2">
              Reading session...
            </Muted>
          )}
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>
      </details>
      {context ? (
        <span
          role="progressbar"
          aria-label={`Context window: ${shown}%`}
          aria-valuenow={shown}
          aria-valuemin={0}
          aria-valuemax={100}
          data-tone={tone}
          title={`Transcript reading at ${date(context.at)}`}
          className="flex size-4 shrink-0 items-center justify-center rounded-full p-0.5"
          style={{
            background: `conic-gradient(${RING[tone]} ${shown}%, var(--border) 0)`,
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
