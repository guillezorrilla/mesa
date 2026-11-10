import type { WorktreeAction, WorktreePreview, WorktreeRow } from '@mesa/core';
import { formatBytes, worktreeName } from '@mesa/core/browser';
import { FolderGit2, Plus } from 'lucide-react';
import { useState } from 'react';
import { SectionLabel } from '@/components/SectionLabel';
import { said } from '@/components/Toast';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import type { CommandState } from '@/lib/useCommand';
import { useCommand, useRun } from '@/lib/useCommand';
import { sortedCards, useWorktreeSort, WORKTREE_SORTS, type WorktreeSort } from './useWorktreeSort';
import { type Card, WorktreeCard } from './WorktreeCard';
import { WorktreeDialog } from './WorktreeDialog';

const SORT_LABELS: Record<WorktreeSort, string> = {
  name: 'Name',
  size: 'Size',
  created: 'Created',
};

/**
 * A project's Worktrees: a card per checkout whose hover actions start a session in it,
 * recycle it (reset for reuse, detached at the default branch), or remove it, each after the
 * guarded preview (CONTEXT.md, Worktree): a remove with local work lists it and asks Delete
 * anyway. Cleanup prunes missing registrations. Sizes on disk load after the cards, which a menu
 * orders by name, size or age.
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
  // Mounted once the cards have loaded: sizes come after, as du can take seconds.
  const sized = useCommand('worktrees.list', { project: props.project, sizes: true });
  const [sort, setSort] = useWorktreeSort();
  const sizes = new Map(sized.data?.map((row) => [row.path, row.sizeBytes]));
  const rows = sortedCards(
    (props.worktrees.data ?? []).map((row) =>
      sizes.has(row.path) ? { ...row, sizeBytes: sizes.get(row.path) } : row,
    ),
    sort,
  );
  const total = sized.data && rows.reduce((sum, row) => sum + (row.sizeBytes ?? 0), 0);
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
      await Promise.all([props.worktrees.refresh(), sized.refresh()]);
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
          <FolderGit2 aria-hidden className="size-4" /> Worktrees ({rows.length}
          {total === undefined ? '' : `, ${formatBytes(total)}`})
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
        <div className="ml-auto w-32">
          <NativeSelect
            size="sm"
            aria-label="Sort worktrees"
            value={sort}
            onChange={(event) => setSort(event.target.value as WorktreeSort)}
          >
            {WORKTREE_SORTS.map((each) => (
              <NativeSelectOption key={each} value={each}>
                {SORT_LABELS[each]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
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
