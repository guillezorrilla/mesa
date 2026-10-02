import type { WorktreeAction, WorktreePreview, WorktreeRow } from '@mesa/core';
import { Folder, FolderGit2, GitBranch, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { said } from '@/components/Toast';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { useRun } from '@/lib/useCommand';

/** A worktree's name on its card: main, else its folder. */
const nameOf = (tree: Pick<WorktreeRow, 'main' | 'path'>) =>
  tree.main ? 'main' : (tree.path.split('/').at(-1) ?? tree.path);

/**
 * A project's Worktrees, as Xirp's: a card per checkout whose hover actions start a session in it,
 * recycle it (reset for reuse, detached at the default branch), or remove it, each after the
 * guarded preview (CONTEXT.md, Worktree): a remove with local work lists it and asks Delete
 * anyway. Cleanup prunes missing registrations.
 */
export function WorktreesSection(props: {
  project: string;
  exists: boolean;
  worktrees: CommandState<WorktreeRow[]>;
  /** A session in `checkout`, or in the main checkout without one. */
  onNewSession: (checkout?: string) => void;
  /** A session in a new worktree. */
  onNewWorktree: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const [asked, setAsked] = useState<{ tree?: WorktreeRow; preview: WorktreePreview }>();
  const [deleteBranch, setDeleteBranch] = useState(false);
  const rows = props.worktrees.data ?? [];
  const stale = rows.some((row) => row.state === 'stale');
  const ask = (action: WorktreeAction, tree?: WorktreeRow) =>
    act(async () => {
      const preview = await run('worktrees.preview', {
        project: props.project,
        action,
        path: tree?.path,
      });
      if (preview) {
        setDeleteBranch(false);
        setAsked({ tree, preview });
      }
      return undefined;
    });
  const apply = (force: boolean) =>
    act(async () => {
      if (!asked) return undefined;
      const { preview, tree } = asked;
      const done = await run('worktrees.apply', {
        project: props.project,
        action: preview.action,
        token: preview.token,
        path: tree?.path,
        force,
        deleteBranch: preview.action === 'recycle' && deleteBranch,
      });
      setAsked(undefined);
      await props.worktrees.refresh();
      if (!done) return undefined;
      const what =
        preview.action === 'cleanup'
          ? `Cleaned up ${done.paths.length} missing worktree(s)`
          : preview.action === 'recycle'
            ? `Recycled ${tree ? nameOf(tree) : 'worktree'} to ${done.base}${done.branchKept ? `; kept branch ${done.branch}: ${done.branchKept}` : ''}`
            : `Removed worktree ${tree ? nameOf(tree) : ''}`;
      return said(what, done);
    });
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FolderGit2 aria-hidden className="size-4" /> Worktrees ({rows.length})
        </h3>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={!stale || acting}
          title={stale ? 'Prune missing worktrees' : 'No missing worktrees'}
          onClick={() => ask('cleanup')}
        >
          Cleanup
        </button>
      </div>
      <div className="flex flex-wrap gap-3">
        {rows.map((tree) => (
          <div
            key={tree.path}
            data-testid="worktree-card"
            className="group relative flex min-w-40 flex-col items-start gap-1 rounded-md border bg-card/40 p-3 pr-20 text-xs"
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              <Folder aria-hidden className="size-3" />
              {nameOf(tree)}
            </span>
            <span className="flex items-center gap-1 font-mono text-state-working">
              <GitBranch aria-hidden className="size-3" />
              {tree.branch ?? 'detached'}
            </span>
            <span className="text-muted-foreground">
              {tree.holders.length ? `${tree.holders.length} session(s)` : tree.state}
            </span>
            <div className="absolute right-1.5 bottom-1.5 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
              <CardAction
                label={`New session in ${nameOf(tree)}`}
                disabled={!props.exists || acting}
                onClick={() => props.onNewSession(tree.main ? undefined : tree.path)}
              >
                <Play aria-hidden />
              </CardAction>
              {!tree.main && (
                <>
                  <CardAction
                    label={`Recycle ${nameOf(tree)}`}
                    disabled={acting}
                    onClick={() => ask('recycle', tree)}
                  >
                    <RefreshCw aria-hidden />
                  </CardAction>
                  <CardAction
                    label={`Remove ${nameOf(tree)}`}
                    disabled={acting}
                    onClick={() => ask('remove', tree)}
                  >
                    <Trash2 aria-hidden />
                  </CardAction>
                </>
              )}
            </div>
          </div>
        ))}
        <button
          type="button"
          className="flex h-12 min-w-24 items-center justify-center gap-2 rounded-md border border-dashed px-4 text-xs text-muted-foreground hover:bg-accent"
          disabled={!props.exists}
          onClick={props.onNewWorktree}
        >
          <Plus aria-hidden className="size-3.5" /> New
        </button>
      </div>
      {asked && (
        <WorktreeDialog
          name={asked.tree ? nameOf(asked.tree) : props.project}
          preview={asked.preview}
          busy={acting}
          deleteBranch={deleteBranch}
          onDeleteBranch={setDeleteBranch}
          onConfirm={apply}
          onCancel={() => setAsked(undefined)}
        />
      )}
    </section>
  );
}

function CardAction(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5"
    >
      {props.children}
    </button>
  );
}

/**
 * The confirmation a preview needs: what the action does, and, for a remove with local work, what
 * it would lose, with Delete anyway; an action the preview refuses says why, with nothing to apply.
 */
function WorktreeDialog(props: {
  name: string;
  preview: WorktreePreview;
  busy: boolean;
  deleteBranch: boolean;
  onDeleteBranch: (on: boolean) => void;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}) {
  const { preview } = props;
  const force = !preview.allowed && preview.forceable;
  const blocked = !preview.allowed && !preview.forceable;
  const title =
    preview.action === 'cleanup'
      ? 'Clean up missing worktrees?'
      : preview.action === 'recycle'
        ? `Recycle ${props.name}?`
        : force
          ? 'Worktree has unsaved work'
          : `Remove ${props.name}?`;
  const description =
    preview.action === 'cleanup'
      ? `Git forgets ${preview.paths.length} worktree(s) whose folders are gone.`
      : preview.action === 'recycle'
        ? `Resets it to ${preview.base ?? 'the default branch'}, detached, for a new session.${preview.branch ? ` Branch ${preview.branch} stays.` : ''}`
        : force
          ? `Removing ${props.name} loses what is listed below.`
          : `Its folder goes; ${preview.branch ? `branch ${preview.branch}` : 'its branch'} stays.`;
  return (
    <ActionDialog
      testId="worktree-dialog"
      title={title}
      description={description}
      submit={{
        label: force
          ? 'Delete anyway'
          : preview.action === 'recycle'
            ? 'Recycle'
            : preview.action === 'cleanup'
              ? 'Clean up'
              : 'Remove',
        testId: 'worktree-confirm',
        disabled: blocked || props.busy,
        variant: preview.action === 'remove' ? 'destructive' : 'default',
      }}
      onSubmit={() => props.onConfirm(force)}
      onCancel={props.onCancel}
    >
      {!preview.allowed && (
        <ul data-testid="worktree-reasons" className="list-disc space-y-1 pl-5 text-sm">
          {preview.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
          {force &&
            preview.changes.slice(0, 8).map((change) => (
              <li key={change} className="font-mono text-xs text-muted-foreground">
                {change}
              </li>
            ))}
        </ul>
      )}
      {preview.action === 'recycle' && preview.branch && !blocked && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="worktree-delete-branch"
            checked={props.deleteBranch}
            onCheckedChange={(on) => props.onDeleteBranch(on === true)}
          />
          <Label htmlFor="worktree-delete-branch">
            Also delete branch {preview.branch} if it is merged
          </Label>
        </div>
      )}
    </ActionDialog>
  );
}
