import { Ellipsis, Pencil, ScrollText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * A row's other actions: Log, Summarise (when it has a log), Rename, and Remove (only
 * once its agent has exited, so the app never forces a live session's window closed).
 * ponytail: a disclosure, not a dropdown menu, so it opens with a click and needs no portal.
 */
export function RowMenu(props: {
  sessionId: string;
  canRemove: boolean;
  canSummarise: boolean;
  onSummarise: () => void;
  onLog: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        data-testid="row-menu"
        aria-label={`More actions for ${props.sessionId}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Ellipsis />
      </Button>
      {open && (
        <>
          <Button variant="outline" size="sm" data-testid="session-log" onClick={pick(props.onLog)}>
            <ScrollText aria-hidden />
            Log
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="session-summarise"
            disabled={!props.canSummarise}
            onClick={pick(props.onSummarise)}
          >
            <ScrollText aria-hidden />
            Summarise
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="session-rename"
            onClick={pick(props.onRename)}
          >
            <Pencil aria-hidden />
            Rename
          </Button>
          <Button
            variant="outline"
            size="sm"
            data-testid="session-remove"
            title={props.canRemove ? undefined : 'Stop it first'}
            disabled={!props.canRemove}
            onClick={pick(props.onRemove)}
          >
            <Trash2 aria-hidden />
            Remove
          </Button>
        </>
      )}
    </div>
  );
}
