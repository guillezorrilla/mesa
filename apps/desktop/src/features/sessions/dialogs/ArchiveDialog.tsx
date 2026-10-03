import type { ManagedRow } from '@mesa/core';
import { sessionTitle } from '@mesa/core/browser';
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
import { exited, recoverable } from '../rows';

/** How many titles a several-session confirmation lists before `and N more`. */
const LISTED = 5;

/**
 * A deliberate end that keeps history, or for one session a separate permanent removal. Several
 * sessions are confirmed together, by title, with how many running ones it terminates.
 */
export function ArchiveDialog(props: {
  rows: ManagedRow[];
  disabled: boolean;
  onArchive: () => void;
  onDelete: (id: string) => void;
  onCancel: () => void;
}) {
  const { rows } = props;
  const [row] = rows;
  const several = rows.length > 1;
  const dismiss = rows.every(recoverable);
  const running = rows.filter((session) => !exited(session)).length;
  // Which button started the action that `disabled` says runs, so it shows the spinner.
  const [pressed, setPressed] = useState<'archive' | 'delete'>();
  const spinner = (button: 'archive' | 'delete') =>
    props.disabled && pressed === button ? (
      <LoaderCircle aria-hidden className="animate-spin" />
    ) : null;
  const verb = dismiss ? 'Dismiss' : 'Archive';
  return (
    <Dialog open onOpenChange={(open) => !open && props.onCancel()}>
      <DialogContent data-testid="archive-dialog" className="bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {several ? `${verb} ${rows.length} sessions?` : `${verb} this session?`}
          </DialogTitle>
          <DialogDescription>
            {several
              ? `${running > 0 ? `This will terminate ${running} running ${running === 1 ? 'session' : 'sessions'}. ` : ''}Their records and logs stay in the archive.`
              : dismiss
                ? 'This hides the ended session from Sessions. Its record and logs stay in the archive.'
                : `This will terminate "${row?.name ?? 'Untitled session'}" and its ${row?.background ? 'Claude background process and tmux view' : 'tmux process'}. This action cannot be undone.`}
          </DialogDescription>
        </DialogHeader>
        {several && (
          <ul className="list-disc space-y-0.5 pl-5 text-sm">
            {rows.slice(0, LISTED).map((session) => (
              <li key={session.id} className="truncate">
                {sessionTitle(session)}
              </li>
            ))}
            {rows.length > LISTED && (
              <li className="list-none text-muted-foreground">and {rows.length - LISTED} more</li>
            )}
          </ul>
        )}
        <DialogFooter className="sm:justify-between">
          {!dismiss && !several && row && (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              disabled={props.disabled}
              onClick={() => {
                setPressed('delete');
                props.onDelete(row.id);
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
              {several ? `${verb} ${rows.length} sessions` : `${verb} session`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
