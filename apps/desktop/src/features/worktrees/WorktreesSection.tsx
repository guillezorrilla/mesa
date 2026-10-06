import type { WorktreeAction, WorktreePreview, WorktreeRow } from '@mesa/core';
import { worktreeName } from '@mesa/core/browser';
import { FolderGit2, Plus } from 'lucide-react';
import { useState } from 'react';
import { SectionLabel } from '@/components/SectionLabel';
import { said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { useRun } from '@/lib/useCommand';
import { type Card, WorktreeCard } from './WorktreeCard';
import { WorktreeDialog } from './WorktreeDialog';

/**
 * A project's Worktrees: a card per checkout whose hover actions start a session in it,
 * recycle it (reset for reuse, detached at the default branch), or remove it, each after the
 * guarded preview (CONTEXT.md, Worktree): a remove with local work lists it and asks Delete
 * anyway. Cleanup prunes missing registrations.
 */
export function WorktreesSection(props: {
  project: string;
  exists: boolean;
  worktrees: CommandState<Card[]>;
  /** Opens a session running in a worktree, as clicking its card does. */
  onSession: (id: string) => void;
  /** A session in `checkout`, or in the main checkout without one. */
  onNewSession: (checkout?: string) => void;
  /** A session in a new worktree. */
  onNewWorktree: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const [asked, setAsked] = useState<{ tree?: WorktreeRow; preview: WorktreePreview }>();
  const [deleteBranch, setDeleteBranch] = useState(false);
  // The card an apply is changing, which says so until the list reloads.
  const [applying, setApplying] = useState<{ path: string; action: WorktreeAction }>();
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
      setAsked(undefined);
      if (tree) setApplying({ path: tree.path, action: preview.action });
      const done = await run('worktrees.apply', {
        project: props.project,
        action: preview.action,
        token: preview.token,
        path: tree?.path,
        force,
        deleteBranch: preview.action === 'recycle' && deleteBranch,
      });
      await props.worktrees.refresh();
      setApplying(undefined);
      if (!done) return undefined;
      const what =
        preview.action === 'cleanup'
          ? `Cleaned up ${done.paths.length} missing worktree(s)`
          : preview.action === 'recycle'
            ? `Recycled ${tree ? worktreeName(tree) : 'worktree'} to ${done.base}${done.fetchFailed ? ' (could not fetch origin first; it may be behind)' : ''}${done.branchKept ? `; kept branch ${done.branch}: ${done.branchKept}` : ''}`
            : `Removed worktree ${tree ? worktreeName(tree) : ''}`;
      return said(what, done);
    });
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <SectionLabel className="flex items-center gap-2">
          <FolderGit2 aria-hidden className="size-4" /> Worktrees ({rows.length})
        </SectionLabel>
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
          <WorktreeCard
            key={tree.path}
            tree={tree}
            exists={props.exists}
            disabled={acting}
            applying={applying?.path === tree.path ? applying.action : undefined}
            onSession={props.onSession}
            onNewSession={() => props.onNewSession(tree.main ? undefined : tree.path)}
            onRecycle={() => ask('recycle', tree)}
            onRemove={() => ask('remove', tree)}
          />
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
          name={asked.tree ? worktreeName(asked.tree) : props.project}
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
