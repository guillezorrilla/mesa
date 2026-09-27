import type { ManagedRow } from '@mesa/core';
import { sessionLabel } from '@mesa/core/browser';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Confirms removing an ended session by listing what will be deleted: its record, hook log, and
 * output log, and, when asked, its worktree and branch. Git refuses a worktree with changes; the toast says so.
 */
export function RemoveDialog(props: {
  row: ManagedRow;
  disabled: boolean;
  onRemove: (opts: { deleteWorktree: boolean; deleteBranch: boolean }) => void;
  onCancel: () => void;
}) {
  const { row } = props;
  const [deleteWorktree, setDeleteWorktree] = useState(false);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const goes = [
    `session ${row.id}'s record, its hook log, and its output log`,
    ...(row.worktree && deleteWorktree ? [`its worktree ${row.worktree.path}`] : []),
    ...(row.worktree && deleteBranch ? [`its branch ${row.worktree.branch}`] : []),
  ];
  return (
    <ActionDialog
      testId="remove-dialog"
      wide
      title={`Remove ${sessionLabel(row)}`}
      description="This deletes, and cannot be undone:"
      submit={{
        label: (
          <>
            <Trash2 aria-hidden />
            Remove
          </>
        ),
        testId: 'remove-confirm',
        disabled: props.disabled,
        variant: 'destructive',
      }}
      onSubmit={() => props.onRemove({ deleteWorktree, deleteBranch })}
      onCancel={props.onCancel}
    >
      <ul data-testid="remove-list" className="list-disc space-y-1 pl-5 text-sm">
        {goes.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      {row.worktree && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Checkbox
              id="remove-worktree"
              data-testid="remove-worktree"
              checked={deleteWorktree}
              onCheckedChange={(v) => setDeleteWorktree(v === true)}
            />
            <Label htmlFor="remove-worktree">Also remove its worktree</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="remove-branch"
              data-testid="remove-branch"
              checked={deleteBranch}
              onCheckedChange={(v) => setDeleteBranch(v === true)}
            />
            <Label htmlFor="remove-branch">Also delete its branch</Label>
          </div>
        </div>
      )}
    </ActionDialog>
  );
}
