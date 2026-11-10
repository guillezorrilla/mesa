import type { CrewRow } from '@mesa/core';
import { sendable, sessionTitle, stoppable, timeAgo } from '@mesa/core/browser';
import { GitBranch, MessageSquare, RefreshCw, Send, Square, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Stat } from '@/components/Stat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { StateBadge } from '../StateBadge';
import { CrewTasks } from './CrewTasks';

/** What the Crew panel does to a child: the Sessions screen's own send, stop and select. */
export type CrewActions = {
  send: (id: string, prompt: string, form: HTMLFormElement) => void;
  stop: (id: string) => void;
  select: (id: string) => void;
};

/**
 * A parent's crew beside its terminal (CONTEXT.md, Crew): each child's state, name, newest report,
 * branch and diff counts, with Send, which opens a composer to it, and Stop, after a confirmation;
 * then the tasks it coordinates (CrewTasks). A new `stamp` (a child's state changed on the Board)
 * reads them again.
 */
export function CrewPanel(props: {
  sessionId: string;
  /** Its project, where a task's worker starts; none for a General session. */
  project?: string;
  stamp: string;
  actions: CrewActions;
  onClose: () => void;
}) {
  const crew = useCommand('sessions.crew', { id: props.sessionId });
  const [composing, setComposing] = useState<string>();
  const [stopping, setStopping] = useState<CrewRow>();
  const seen = useRef(props.stamp);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new stamp reads again.
  useEffect(() => {
    if (props.stamp !== seen.current) void crew.refresh();
    seen.current = props.stamp;
  }, [props.stamp]);
  const rows = crew.data;
  return (
    <aside
      aria-label="Crew"
      className="flex h-full w-96 min-h-0 shrink-0 flex-col border-l bg-card"
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Users aria-hidden className="size-4 text-state-working" />
        <span className="text-sm font-medium">Crew</span>
        {rows && <span className="text-xs text-muted-foreground">{rows.length}</span>}
        <span className="ml-auto" />
        <IconButton
          label="Refresh crew"
          icon={RefreshCw}
          disabled={crew.busy}
          className={cn(crew.busy && '[&_svg]:animate-spin')}
          onClick={() => void crew.refresh()}
        />
        <IconButton label="Close crew" icon={X} onClick={props.onClose} />
      </header>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {!rows ? (
          <Muted className="px-3 py-2">{crew.error ? 'Could not read the crew' : 'Reading'}</Muted>
        ) : !rows.length ? (
          <Muted className="px-3 py-2">No workers yet. Start one with New worker.</Muted>
        ) : (
          <ul data-testid="session-crew">
            {rows.map((row) => (
              <CrewMember
                key={row.id}
                row={row}
                composing={composing === row.id}
                onCompose={() => setComposing(composing === row.id ? undefined : row.id)}
                onSend={(text, form) => props.actions.send(row.id, text, form)}
                onStop={() => setStopping(row)}
              />
            ))}
          </ul>
        )}
        <CrewTasks
          coordinator={props.sessionId}
          project={props.project}
          stamp={props.stamp}
          nameOf={(id) => {
            const child = rows?.find((row) => row.id === id);
            return child ? sessionTitle(child) : id;
          }}
          onSelect={props.actions.select}
        />
      </div>
      {stopping && (
        <ActionDialog
          testId="crew-stop-dialog"
          title={`Stop ${sessionTitle(stopping)}?`}
          description="Its agent ends now. Its worktree, branch and reports stay."
          submit={{
            label: 'Stop',
            testId: 'crew-stop-confirm',
            disabled: false,
            variant: 'destructive',
          }}
          onSubmit={() => {
            props.actions.stop(stopping.id);
            setStopping(undefined);
          }}
          onCancel={() => setStopping(undefined)}
        />
      )}
    </aside>
  );
}

/** One child: state and name, then its newest report's first two lines, then branch and diff. */
function CrewMember(props: {
  row: CrewRow;
  composing: boolean;
  onCompose: () => void;
  onSend: (text: string, form: HTMLFormElement) => void;
  onStop: () => void;
}) {
  const { row } = props;
  const name = sessionTitle(row);
  const report = row.report;
  return (
    <li
      data-testid="crew-row"
      className="group mx-1.5 grid gap-1 rounded-md px-2 py-2 hover:bg-accent/40"
    >
      <div className="flex min-w-0 items-center gap-2">
        <StateBadge state={row.lastState.state} compact />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium" title={name}>
          {name}
        </span>
        <IconButton
          label={`Message ${name}`}
          icon={MessageSquare}
          size="icon-xs"
          active={props.composing}
          disabled={!sendable(row)}
          onClick={props.onCompose}
        />
        <IconButton
          label={`Stop ${name}`}
          icon={Square}
          size="icon-xs"
          disabled={!stoppable(row)}
          onClick={props.onStop}
        />
      </div>
      {report ? (
        <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">
          <span className="font-mono text-foreground/80">{report.kind}</span>{' '}
          <span title={report.at}>{timeAgo(report.at, Date.now())}</span>
          {' · '}
          {report.message.split('\n').slice(0, 2).join('\n')}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No report yet</p>
      )}
      <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <GitBranch aria-hidden className="size-3 shrink-0" />
        <span className="truncate">{row.branch ?? 'no branch'}</span>
        {row.diff && <Stat className="ml-auto text-[11px]" {...row.diff} />}
      </div>
      {props.composing && (
        <form
          className="flex gap-1.5 pt-1"
          onSubmit={(event) => {
            event.preventDefault();
            const text = String(new FormData(event.currentTarget).get('prompt') ?? '');
            if (text.trim()) props.onSend(text, event.currentTarget);
          }}
        >
          <Textarea
            name="prompt"
            aria-label={`Message for ${name}`}
            placeholder={`Message ${name}`}
            rows={2}
            autoFocus
            className="min-h-9 flex-1 resize-y text-xs"
          />
          <Button type="submit" size="sm" aria-label={`Send to ${name}`}>
            <Send aria-hidden />
          </Button>
        </form>
      )}
    </li>
  );
}
