import type { WorktreeAction, WorktreeDetails, WorktreeRow } from '@mesa/core';
import { Folder, FolderGit2, GitBranch, LoaderCircle, Play, RefreshCw, Trash2 } from 'lucide-react';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { CardAction } from './CardAction';
import { nameOf } from './worktreeName';
import { statusOf } from './worktreeStatus';

/** A checkout as its card shows it: the worktree and what is in it. */
export type Card = WorktreeRow & WorktreeDetails;

/**
 * One checkout, as the reference app's card: with a session in it, a click opens that session and there is no
 * New session; otherwise a click, or the play action, starts one. A linked worktree adds Recycle and
 * Remove, its commits ahead of the default branch, and its age, which the actions cover on hover.
 */
export function WorktreeCard(props: {
  tree: Card;
  exists: boolean;
  disabled: boolean;
  applying?: WorktreeAction;
  onSession: (id: string) => void;
  onNewSession: () => void;
  onRecycle: () => void;
  onRemove: () => void;
}) {
  const { tree } = props;
  const held = tree.holders[0];
  const name = nameOf(tree);
  const open = props.applying
    ? undefined
    : held
      ? () => props.onSession(held.id)
      : props.exists
        ? props.onNewSession
        : undefined;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the card's own buttons carry its actions; a click is a shortcut
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above
    <div
      data-testid="worktree-card"
      data-held={held ? 'true' : undefined}
      onClick={open}
      className={cn(
        'group relative flex min-w-44 flex-col items-start gap-1 rounded-md border bg-card/40 p-3 text-xs',
        open && 'cursor-pointer hover:bg-accent/40',
        held && 'border-state-working/40',
        props.applying && 'opacity-60',
      )}
    >
      <span className="flex items-center gap-1 text-muted-foreground">
        {tree.main ? (
          <Folder aria-hidden className="size-3" />
        ) : (
          <FolderGit2 aria-hidden className="size-3" />
        )}
        <span className="truncate font-mono" title={tree.path}>
          {name}
        </span>
      </span>
      <span className="flex items-center gap-1 font-mono text-state-working">
        <GitBranch aria-hidden className="size-3" />
        {tree.branch ?? 'detached'}
        {!tree.main && (tree.ahead ?? 0) > 0 && (
          <span className="text-[10px] text-muted-foreground">+{tree.ahead}</span>
        )}
      </span>
      <span className="flex w-full items-center gap-2 text-muted-foreground">
        <span
          data-testid="worktree-status"
          className={cn(
            'flex items-center gap-1',
            held?.state === 'working' && 'text-state-working',
            held?.state.startsWith('waiting') && 'text-state-waiting',
          )}
        >
          {props.applying && <LoaderCircle aria-hidden className="size-3 animate-spin" />}
          {statusOf(tree, props.applying)}
        </span>
        {tree.createdAt && (
          <span className="ml-auto pr-1 group-hover:invisible">
            created {timeAgo(tree.createdAt)}
          </span>
        )}
      </span>
      {!props.applying && (
        <div className="absolute right-1.5 bottom-1.5 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {!held && (
            <CardAction
              label={`New session in ${name}`}
              disabled={!props.exists || props.disabled}
              onClick={props.onNewSession}
            >
              <Play aria-hidden />
            </CardAction>
          )}
          {!tree.main && (
            <>
              <CardAction
                label={`Recycle ${name}`}
                disabled={props.disabled}
                onClick={props.onRecycle}
              >
                <RefreshCw aria-hidden />
              </CardAction>
              <CardAction
                label={`Remove ${name}`}
                disabled={props.disabled}
                onClick={props.onRemove}
              >
                <Trash2 aria-hidden />
              </CardAction>
            </>
          )}
        </div>
      )}
    </div>
  );
}
