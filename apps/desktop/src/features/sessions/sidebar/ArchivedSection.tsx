import type { ManagedRow } from '@mesa/core';
import { projectLabel, relativeAgo, sessionTitle } from '@mesa/core/browser';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CountPill } from '@/components/CountPill';
import { IconButton } from '@/components/IconButton';
import { useCommand } from '@/lib/useCommand';
import { RemoveDialog } from '../dialogs/RemoveDialog';
import { useSessionAct } from '../useSessionAct';
import { useSessionCommands } from '../useSessionCommands';

/**
 * The Sessions tab's Archived section (CONTEXT.md, Archived session), folded until opened, with
 * its count: each archived session by title, project, and when it was archived, newest first,
 * with Unarchive (unarchived and resumed, then shown in its project group) and Delete permanently
 * (the Remove confirmation, `mesa rm`).
 */
export function ArchivedSection(props: {
  /**
   * The ids of the sessions on the board: one joining or leaving it (an archive, an unarchive)
   * reads the list again.
   */
  onBoard: readonly string[];
  /** Shows a session: the one an Unarchive resumed. */
  onSelectSession: (id: string) => void;
}) {
  const archived = useCommand('sessions.archived');
  const rows = archived.data ?? [];
  const { refresh } = archived;
  const board = props.onBoard.join(' ');
  const lastBoard = useRef(board);
  useEffect(() => {
    if (lastBoard.current === board) return;
    lastBoard.current = board;
    void refresh();
  }, [board, refresh]);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<ManagedRow>();
  const selectionVersion = useRef(0);
  // Each action reads the list again when it ends, so the section shows what it did.
  const { acting, act, once } = useSessionAct(refresh);
  const commands = useSessionCommands({
    act,
    once,
    look: refresh,
    closeDialog: () => setRemoving(undefined),
    rows,
    selectionVersion,
    onSelectSession: props.onSelectSession,
  });
  const now = Date.now();
  return (
    <div data-testid="archived-sessions" className="mt-4">
      <button
        type="button"
        data-testid="archived-toggle"
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <ChevronDown aria-hidden className="size-3 shrink-0" />
        ) : (
          <ChevronRight aria-hidden className="size-3 shrink-0" />
        )}
        <Archive aria-hidden className="size-3.5 shrink-0" />
        <span className="flex-1 font-medium">Archived</span>
        <CountPill
          count={rows.length}
          className="bg-muted text-[10px] leading-4 font-medium text-muted-foreground tabular-nums"
        />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 px-1">
          {rows.map((row) => (
            <li
              key={row.id}
              data-testid="archived-session"
              data-session-id={row.id}
              className="flex items-center gap-1 rounded-md py-1 pr-0.5 pl-2 text-xs hover:bg-accent"
            >
              <div className="min-w-0 flex-1" title={`${projectLabel(row.project)}: ${row.id}`}>
                <p className="truncate font-medium">{sessionTitle(row)}</p>
                <p className="truncate text-muted-foreground">
                  {projectLabel(row.project)}
                  {row.archivedAt && `, archived ${relativeAgo(row.archivedAt, now)}`}
                </p>
              </div>
              <IconButton
                label="Unarchive"
                icon={ArchiveRestore}
                disabled={acting}
                onClick={() => commands.unarchive(row.id)}
              />
              <IconButton
                label="Delete permanently"
                icon={Trash2}
                className="hover:text-destructive"
                disabled={acting}
                onClick={() => setRemoving(row)}
              />
            </li>
          ))}
          {rows.length === 0 && <li className="px-2 text-xs text-muted-foreground">None</li>}
        </ul>
      )}
      {removing && (
        <RemoveDialog
          row={removing}
          disabled={acting}
          onRemove={(options) => commands.remove(removing.id, options)}
          onCancel={() => setRemoving(undefined)}
        />
      )}
    </div>
  );
}
