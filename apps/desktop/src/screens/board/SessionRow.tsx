import type { TreeRow } from '@mesa/core';
import { Download, RotateCcw, Send, Square, SquareTerminal } from 'lucide-react';
import { StateBadge } from '@/components/StateBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ReceivedPrompts } from './ReceivedPrompts';
import { RowMenu } from './RowMenu';
import { decidedBy, exited, resumable, running, ticking } from './rows';
import { TreeToggle } from './TreeToggle';

/** What a row can ask the Board to do; the Board runs one action at a time. */
export type RowActions = {
  embed: (id: string) => void;
  send: (id: string, form: HTMLFormElement) => void;
  openTerminal: (id: string) => void;
  stop: (id: string) => void;
  resume: (id: string) => void;
  adopt: (agentSessionId: string, project?: string) => void;
  /** Open the Rename or the Remove dialog for this row. */
  rename: (row: TreeRow) => void;
  remove: (row: TreeRow) => void;
};

/**
 * One Board row: the session's id (a live one opens its terminal here), project with its branch
 * and goal, agent, state, attention, running time, last output, and its actions. A foreign
 * session is muted, with Adopt its only action.
 */
export function SessionRow(props: {
  row: TreeRow;
  below: readonly TreeRow[];
  closed: boolean;
  onToggle: () => void;
  /** Seconds since the rows arrived, added to a running clock. */
  elapsed: number;
  acting: boolean;
  actions: RowActions;
}) {
  const { row: s, below, acting, actions } = props;
  // A name a person gave it stands in for the id, which stays on hover.
  const label = s.managed && s.name ? s.name : s.id;
  return (
    <TableRow
      data-testid="session-row"
      data-depth={s.depth}
      data-alive={s.alive}
      data-managed={s.managed}
      className={cn(!s.managed && 'opacity-60')}
    >
      <TableCell style={{ paddingLeft: `${0.5 + s.depth * 1.5}rem` }} className="font-mono">
        {below.length > 0 && (
          <>
            <TreeToggle below={below} closed={props.closed} onToggle={props.onToggle} />{' '}
          </>
        )}
        {s.managed && !exited(s) ? (
          <button
            type="button"
            className="underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-foreground"
            data-testid="embed-terminal"
            title={`Open its terminal here${s.name ? ` (${s.id})` : ''}`}
            onClick={() => actions.embed(s.id)}
          >
            {label}
          </button>
        ) : (
          <span title={s.managed && s.name ? s.id : undefined}>{label}</span>
        )}
      </TableCell>
      <TableCell>
        {s.project ?? '-'}
        {s.managed && s.worktree && (
          <div
            data-testid="session-branch"
            title={s.worktree.path}
            className="max-w-80 truncate font-mono text-muted-foreground text-xs"
          >
            {s.worktree.branch}
          </div>
        )}
        {s.managed && s.goal && (
          <div
            data-testid="session-goal"
            title={s.goal}
            className="max-w-80 truncate text-muted-foreground text-xs"
          >
            {s.goal.trim().split(/\r?\n/, 1)[0]}
          </div>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">{s.agent}</TableCell>
      <TableCell>
        <StateBadge
          state={s.lastState.state}
          confidence={s.lastState.confidence}
          title={decidedBy(s.decision)}
        />
      </TableCell>
      <TableCell data-testid="session-attention" className="font-mono tabular-nums">
        {s.attention.toFixed(2)}
      </TableCell>
      <TableCell data-testid="session-running" className="font-mono tabular-nums">
        {running(s.runningSeconds + (ticking(s) ? props.elapsed : 0))}
      </TableCell>
      <TableCell className="max-w-96 truncate font-mono text-muted-foreground text-xs">
        {s.managed ? (s.lastOutput ?? '') : ''}
      </TableCell>
      <TableCell>
        {s.managed ? (
          <div className="flex flex-col gap-1">
            <form
              data-testid="session-send"
              className="flex gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!acting) actions.send(s.id, e.currentTarget);
              }}
            >
              <Input
                name="prompt"
                data-testid="session-prompt"
                aria-label={`Prompt for ${s.id}`}
                placeholder="Prompt"
                className="h-8 w-48"
                disabled={exited(s)}
              />
              <Button
                type="submit"
                size="sm"
                data-testid="session-send-submit"
                disabled={exited(s) || acting}
              >
                <Send aria-hidden />
                Send
              </Button>
            </form>
            <ReceivedPrompts row={s} />
            <div className="flex flex-wrap gap-1">
              <Button
                variant="outline"
                size="sm"
                data-testid="open-terminal"
                onClick={() => actions.openTerminal(s.id)}
                disabled={!s.alive || acting}
              >
                <SquareTerminal aria-hidden />
                Open terminal
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="session-stop"
                onClick={() => actions.stop(s.id)}
                disabled={!s.alive || acting}
              >
                <Square aria-hidden />
                Stop
              </Button>
              <Button
                variant="outline"
                size="sm"
                data-testid="session-resume"
                onClick={() => actions.resume(s.id)}
                disabled={!resumable(s) || acting}
              >
                <RotateCcw aria-hidden />
                Resume
              </Button>
              <RowMenu
                sessionId={s.id}
                canRemove={exited(s) && !acting}
                onRename={() => actions.rename(s)}
                onRemove={() => actions.remove(s)}
              />
            </div>
          </div>
        ) : (
          // Started outside Mesa: shown so the board is complete; Adopt makes it Mesa's.
          <div className="flex items-center gap-2">
            <Badge variant="outline" title={s.cwd}>
              not managed
            </Badge>
            <Button
              variant="outline"
              size="sm"
              data-testid="session-adopt"
              title="Reopen its conversation in a Mesa window"
              onClick={() => actions.adopt(s.agentSessionId, s.project ?? undefined)}
              disabled={acting}
            >
              <Download aria-hidden />
              Adopt
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
