import type { TreeRow } from '@mesa/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useCall, useRun } from '@/lib/useCommand';
import { useWindowFocused } from '@/lib/useWindowFocused';
import type { WorkspaceView } from '@/lib/workspaceView';

/** How long a mark shows before the looks read it back. */
const MARK_MS = 5_000;

export type Unread = {
  /** Whether the card shows `row` unread. */
  unread: (row: TreeRow) => boolean;
  /** Marks the sessions read or unread, shown at once. */
  mark: (ids: readonly string[], unread: boolean) => void;
  /** Marks the shown Mesa session unread, or read when it is (Cmd+Shift+U). */
  toggleShown: () => void;
};

/** The sidebar's Unread; none outside the app, where every card shows read. */
export const UnreadContext = createContext<Unread | undefined>(undefined);
export const useUnreadContext = () => useContext(UnreadContext);

/**
 * Unread sessions (CONTEXT.md, Unread): the session shown in a focused window is read, marked when
 * it is shown, when the window gains focus, and when it finishes there. A session marked unread
 * while shown stays unread until another session is shown.
 */
export function useUnread(view: WorkspaceView, sessions: readonly TreeRow[]): Unread {
  const call = useCall();
  const run = useRun();
  const focused = useWindowFocused();
  const shown = view.kind === 'session' ? view.id : undefined;
  // Marks the looks have not read back yet, by id: the value and when it was made.
  const [pending, setPending] = useState<Record<string, { unread: boolean; at: number }>>({});
  // The shown session marked unread by hand, held so until another is shown.
  const [held, setHeld] = useState<string>();
  if (held && held !== shown) setHeld(undefined);
  const watching = focused && held !== shown ? shown : undefined;
  const isUnread = useCallback(
    (row: TreeRow) => {
      const mark = pending[row.id];
      if (mark && Date.now() - mark.at < MARK_MS) return mark.unread;
      return row.managed && row.unread === true;
    },
    [pending],
  );
  const showMarks = useCallback(
    (ids: readonly string[], unread: boolean) =>
      setPending((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([, mark]) => Date.now() - mark.at < MARK_MS),
        ),
        ...Object.fromEntries(ids.map((id) => [id, { unread, at: Date.now() }])),
      })),
    [],
  );
  const watched = sessions.find((row) => row.id === watching);
  const toRead = watched && isUnread(watched) ? watched.id : undefined;
  const reading = useRef<string>(undefined);
  useEffect(() => {
    if (!toRead || reading.current === toRead) return;
    reading.current = toRead;
    showMarks([toRead], false);
    // Quietly: a failed mark leaves it unread, and the next look tries again.
    void call('sessions.read', { id: toRead }).finally(() => {
      reading.current = undefined;
    });
  }, [toRead, call, showMarks]);
  const mark = (ids: readonly string[], unread: boolean) => {
    if (unread && shown && ids.includes(shown)) setHeld(shown);
    showMarks(ids, unread);
    for (const id of ids) void run(unread ? 'sessions.unread' : 'sessions.read', { id });
  };
  const unread = (row: TreeRow) => row.id !== watching && isUnread(row);
  return {
    unread,
    mark,
    toggleShown: () => {
      const row = sessions.find((s) => s.id === shown);
      if (row?.managed) mark([row.id], !unread(row));
    },
  };
}
