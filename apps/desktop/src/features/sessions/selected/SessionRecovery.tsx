import type { TreeRow } from '@mesa/core';
import { recoverable, resumable } from '@mesa/core/browser';
import { RotateCcw } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import type { OpenDialog } from '../dialogs/SessionDialogs';

/**
 * What the selected session shows in place of its terminal when it has none: Restore or Dismiss
 * once its terminal ended, or why it is missing.
 */
export function SessionRecovery({
  row,
  loaded,
  acting,
  onResume,
  onDialog,
}: {
  row?: TreeRow;
  /** Sessions' rows have arrived, so a missing row is unavailable, not loading. */
  loaded: boolean;
  acting: boolean;
  onResume: (id: string) => void;
  onDialog: (dialog: OpenDialog) => void;
}) {
  return row && recoverable(row) ? (
    <div
      data-testid="session-recovery"
      className="m-4 flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4 text-sm"
    >
      <p className="flex-1">This session's terminal ended. Its record and logs remain available.</p>
      {resumable(row) && (
        <Button disabled={acting} onClick={() => onResume(row.id)}>
          <RotateCcw aria-hidden /> Restore
        </Button>
      )}
      <Button
        variant="outline"
        disabled={acting}
        onClick={() => onDialog({ kind: 'archive', rows: [row] })}
      >
        Dismiss
      </Button>
    </div>
  ) : (
    !row && (
      <Muted className="p-4">
        {loaded ? 'Session unavailable. Open Sessions to choose another.' : 'Loading session...'}
      </Muted>
    )
  );
}
