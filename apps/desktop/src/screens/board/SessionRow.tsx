import type { TreeRow } from '@mesa/core';
import {
  attentionScore,
  duration,
  sessionBranch,
  sessionLabel,
  waitingOn,
} from '@mesa/core/browser';
import { Download, Forward, RotateCcw, Send, Square, SquareTerminal } from 'lucide-react';
import { ContextBar } from '@/components/ContextBar';
import { StateBadge } from '@/components/StateBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { ReceivedPrompts } from './ReceivedPrompts';
import { RowMenu } from './RowMenu';
import { decidedBy, exited, queued, resumable, ticking } from './rows';
import { TreeToggle } from './TreeToggle';

/** What a row can ask the Board to do; the Board runs one action at a time. */
export type RowActions = {
  embed: (id: string) => void;
  send: (id: string, form: HTMLFormElement) => void;
  openTerminal: (id: string) => void;
  stop: (id: string) => void;
  resume: (id: string) => void;
  adopt: (agentSessionId: string, project?: string) => void;
  /** Open the Hand off, Log, Rename, or Remove dialog for this row. */
  handoff: (row: TreeRow) => void;
  log: (row: TreeRow) => void;
  rename: (row: TreeRow) => void;
  remove: (row: TreeRow) => void;
};

/**
 * One Board row: the session's id (a live one opens its terminal here), project with its branch
 * and goal, agent, state, attention, context use, running time, last output (for a queued one,
 * the session it waits on), and its actions. A foreign session is muted, with Adopt its only
 * action.
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
  const label = sessionLabel(s);
  const branch = sessionBranch(s);
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
        {s.managed && branch && (
          <div
            data-testid="session-branch"
            title={s.worktree?.path}
            className="max-w-80 truncate font-mono text-muted-foreground text-xs"
          >
            {branch}
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
        {attentionScore(s.attention)}
      </TableCell>
      <TableCell data-testid="session-context">
        {s.managed && s.context ? (
          <ContextBar used={s.context.used} window={s.context.window} />
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell data-testid="session-running" className="font-mono tabular-nums">
        {duration(s.runningSeconds + (ticking(s) ? props.elapsed : 0))}
      </TableCell>
      <TableCell className="max-w-96 truncate font-mono text-muted-foreground text-xs">
        {s.managed && queued(s) ? (
          <span data-testid="session-waiting">{waitingOn(s.after)}</span>
        ) : s.managed ? (
          (s.lastOutput ?? '')
        ) : (
          ''
        )}
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
                title={queued(s) ? 'Cancel it: it never starts' : undefined}
                onClick={() => actions.stop(s.id)}
                disabled={!(s.alive || queued(s)) || acting}
              >
                <Square aria-hidden />
                {queued(s) ? 'Cancel' : 'Stop'}
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
              <Button
                variant="outline"
                size="sm"
                data-testid="session-handoff"
                title={s.goal ? 'Continue its work in a successor' : 'It has no goal to hand on'}
                onClick={() => actions.handoff(s)}
                disabled={exited(s) || !s.goal || acting}
              >
                <Forward aria-hidden />
                Hand off
              </Button>
              <RowMenu
                sessionId={s.id}
                canRemove={exited(s) && !queued(s) && !acting}
                onLog={() => actions.log(s)}
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
