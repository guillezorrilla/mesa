import type { TreeRow } from '@mesa/core';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useCall, useRun } from '@/lib/useCommand';
import type { WorkspaceView } from '@/lib/workspaceView';

/** How long a mark shows before the looks read it back. */
const MARK_MS = 5_000;

export type Unread = {
  /** Whether the card shows `row` unread. */
  unread: (row: TreeRow) => boolean;
  /** Marks the sessions read or unread, shown at once. */
  mark: (ids: readonly string[], unread: boolean) => void;
};

/** The sidebar's Unread; none outside the app, where every card shows read. */
export const UnreadContext = createContext<Unread | undefined>(undefined);
export const useUnreadContext = () => useContext(UnreadContext);

/** Whether the app's window has focus now. */
function useWindowFocused() {
  const [focused, setFocused] = useState(() => document.hasFocus());
  useEffect(() => {
    const on = () => setFocused(true);
    const off = () => setFocused(false);
    window.addEventListener('focus', on);
    window.addEventListener('blur', off);
    return () => {
      window.removeEventListener('focus', on);
      window.removeEventListener('blur', off);
    };
  }, []);
  return focused;
}

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
  // Marks not yet read back by a look, by id: the value and when it was made.
  const [marks, setMarks] = useState<Record<string, { unread: boolean; at: number }>>({});
  const [kept, setKept] = useState<string>();
  if (kept && kept !== shown) setKept(undefined);
  const watched = focused && kept !== shown ? shown : undefined;
  const stored = useCallback(
    (row: TreeRow) => {
      const mark = marks[row.id];
      if (mark && Date.now() - mark.at < MARK_MS) return mark.unread;
      return row.managed && row.unread === true;
    },
    [marks],
  );
  const note = useCallback(
    (ids: readonly string[], unread: boolean) =>
      setMarks((current) => ({
        ...Object.fromEntries(
          Object.entries(current).filter(([, mark]) => Date.now() - mark.at < MARK_MS),
        ),
        ...Object.fromEntries(ids.map((id) => [id, { unread, at: Date.now() }])),
      })),
    [],
  );
  const row = sessions.find((s) => s.id === watched);
  const toRead = row && stored(row) ? row.id : undefined;
  const reading = useRef<string>(undefined);
  useEffect(() => {
    if (!toRead || reading.current === toRead) return;
    reading.current = toRead;
    note([toRead], false);
    // Quietly: a failed mark leaves it unread, and the next look tries again.
    void call('sessions.read', { id: toRead }).finally(() => {
      reading.current = undefined;
    });
  }, [toRead, call, note]);
  return {
    unread: (r) => r.id !== watched && stored(r),
    mark: (ids, unread) => {
      if (unread && shown && ids.includes(shown)) setKept(shown);
      note(ids, unread);
      for (const id of ids) void run(unread ? 'sessions.unread' : 'sessions.read', { id });
    },
  };
}
