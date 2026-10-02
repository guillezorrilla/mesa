import type { ManagedRow } from '@mesa/core';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { recoverable } from '../rows';

/** A deliberate end that keeps history, or a separate permanent removal. */
export function ArchiveDialog(props: {
  row: ManagedRow;
  disabled: boolean;
  onArchive: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const dismiss = recoverable(props.row);
  // Which button started the action that `disabled` says runs, so it shows the spinner.
  const [pressed, setPressed] = useState<'archive' | 'delete'>();
  const spinner = (button: 'archive' | 'delete') =>
    props.disabled && pressed === button ? (
      <LoaderCircle aria-hidden className="animate-spin" />
    ) : null;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="archive-dialog" className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dismiss ? 'Dismiss this session?' : 'Archive this session?'}</DialogTitle>
          <DialogDescription>
            {dismiss
              ? 'This hides the ended session from Sessions. Its record and logs stay in the archive.'
              : `This will terminate "${props.row.name ?? 'Untitled session'}" and its ${props.row.background ? 'Claude background process and tmux view' : 'tmux process'}. This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="sm:justify-between">
          {!dismiss && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={props.disabled}
              onClick={() => {
                setPressed('delete');
                props.onDelete();
              }}
            >
              {spinner('delete')}
              Delete permanently
            </Button>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={props.onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              data-testid="archive-confirm"
              className="bg-ring text-archive-foreground hover:bg-ring/80"
              disabled={props.disabled}
              onClick={() => {
                setPressed('archive');
                props.onArchive();
              }}
            >
              {spinner('archive')}
              {dismiss ? 'Dismiss session' : 'Archive session'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
