import type { ManagedRow } from '@mesa/core';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

/**
 * Confirms removing an ended session by listing what will be deleted: its record and hook log,
 * and, when asked, its worktree and branch. Git refuses a worktree with changes; the toast says so.
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
    `session ${row.id}'s record and its hook log`,
    ...(row.worktree && deleteWorktree ? [`its worktree ${row.worktree.path}`] : []),
    ...(row.worktree && deleteBranch ? [`its branch ${row.worktree.branch}`] : []),
  ];
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="remove-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Remove {row.name ?? row.id}</DialogTitle>
          <DialogDescription>This deletes, and cannot be undone:</DialogDescription>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="outline" onClick={props.onCancel}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            data-testid="remove-confirm"
            disabled={props.disabled}
            onClick={() => props.onRemove({ deleteWorktree, deleteBranch })}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
