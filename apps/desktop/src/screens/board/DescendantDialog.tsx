import type { ManagedRow, TreeRow } from '@mesa/core';
import { descendantOrder, sessionLabel } from '@mesa/core/browser';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useCommand } from '@/lib/useCommand';
import { exited, queued } from './rows';

/** Confirm the exact parent-linked subtree before a child-first stop or removal. */
export function DescendantDialog(props: {
  row: ManagedRow;
  action: 'stop' | 'remove';
  disabled: boolean;
  onConfirm: (ids: string[], options: { deleteWorktree: boolean; deleteBranch: boolean }) => void;
  onCancel: () => void;
}) {
  const { data, busy } = useCommand('sessions.all');
  const [deleteWorktree, setDeleteWorktree] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const rows = data?.filter((row): row is TreeRow & ManagedRow => row.managed);
  const ordered = rows?.some((row) => row.id === props.row.id)
    ? descendantOrder(rows, props.row.id)
    : [];
  const removalBlocked =
    props.action === 'remove' && ordered.some((row) => !exited(row) || queued(row));
  const worktrees = ordered.filter((row) => row.worktree);
  return (
    <ActionDialog
      testId="descendant-dialog"
      wide
      title={`${props.action === 'stop' ? 'Stop' : 'Remove'} session and descendants?`}
      description={
        !data
          ? 'Loading sessions...'
          : props.action === 'remove'
            ? `This deletes ${ordered.length} session records and logs, child first. Worktrees and branches stay unless selected.`
            : `This ends ${ordered.length} parent-linked sessions, child first. An "after" link alone is not a descendant.`
      }
      submit={{
        label: `${props.action === 'stop' ? 'Stop' : 'Remove'} ${ordered.length} sessions`,
        testId: 'descendant-confirm',
        disabled: props.disabled || busy || ordered.length < 2 || removalBlocked,
        variant: props.action === 'remove' ? 'destructive' : 'default',
      }}
      onSubmit={() =>
        props.onConfirm(
          ordered.map((row) => row.id),
          { deleteWorktree, deleteBranch },
        )
      }
      onCancel={props.onCancel}
    >
      <ol
        data-testid="descendant-list"
        className="max-h-64 list-decimal space-y-1 overflow-auto pl-5 text-sm"
      >
        {ordered.map((row) => (
          <li key={row.id}>
            {sessionLabel(row)}{' '}
            {sessionLabel(row) !== row.id && (
              <span className="font-mono text-muted-foreground">{row.id}</span>
            )}
            {' - '}
            {queued(row) ? 'queued' : exited(row) ? 'ended' : 'live'}
            {row.worktree && (
              <span className="block break-all text-xs text-muted-foreground">
                {row.worktree.path} ({row.worktree.branch})
              </span>
            )}
          </li>
        ))}
      </ol>
      {removalBlocked && (
        <p className="text-sm text-destructive">
          Stop live and queued sessions before removing them.
        </p>
      )}
      {props.action === 'remove' && worktrees.length > 0 && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="descendant-worktrees"
              checked={deleteWorktree}
              onCheckedChange={(value) => setDeleteWorktree(value === true)}
            />
            <Label htmlFor="descendant-worktrees">Also remove their worktrees</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="descendant-branches"
              checked={deleteBranch}
              onCheckedChange={(value) => setDeleteBranch(value === true)}
            />
            <Label htmlFor="descendant-branches">Also delete their branches</Label>
          </div>
        </div>
      )}
    </ActionDialog>
  );
}
