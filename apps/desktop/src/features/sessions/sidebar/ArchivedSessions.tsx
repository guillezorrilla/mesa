import type { ManagedRow } from '@mesa/core';
import { projectLabel, relativeAgo, sessionTitle } from '@mesa/core/browser';
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CountPill } from '@/components/CountPill';
import { IconButton } from '@/components/IconButton';
import { warningOf } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import { RemoveDialog } from '../dialogs/RemoveDialog';
import { useSessionAct } from '../useSessionAct';
import { useUnarchive } from '../useUnarchive';
import { useArchivedSessions } from './useArchivedSessions';

/**
 * The Sessions tab's Archived section (CONTEXT.md, Archived session), folded until opened, with
 * its count: each archived session by title, project, and when it was archived, newest first,
 * with Unarchive (`mesa unarchive`) and Delete permanently (the Remove confirmation, `mesa rm`).
 * `board` is the board's session ids, whose change reads the list again.
 */
export function ArchivedSessions(props: { board: string }) {
  const { rows, look } = useArchivedSessions(props.board);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState<ManagedRow>();
  // Each action reads the list again when it ends, so the section shows what it did.
  const { acting, act } = useSessionAct(look);
  const run = useRun();
  const { unarchive } = useUnarchive();
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
                onClick={() => act(() => unarchive([{ id: row.id, title: sessionTitle(row) }]))}
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
          onRemove={(options) =>
            act(async () => {
              const removed = await run('sessions.remove', { id: removing.id, ...options });
              if (!removed) return undefined;
              setRemoving(undefined);
              return warningOf(removed);
            })
          }
          onCancel={() => setRemoving(undefined)}
        />
      )}
    </div>
  );
}
