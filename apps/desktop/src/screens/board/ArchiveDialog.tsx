import type { ManagedRow } from '@mesa/core';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** A deliberate end that keeps history, or a separate permanent removal. */
export function ArchiveDialog(props: {
  row: ManagedRow;
  disabled: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="archive-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Archive this session?</DialogTitle>
          <DialogDescription>
            This will terminate "{props.row.name ?? 'Untitled session'}" and its tmux process. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={props.disabled}
            onClick={props.onDelete}
          >
            Delete permanently
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="archive-confirm"
              disabled={props.disabled}
              onClick={props.onArchive}
            >
              Archive session
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
