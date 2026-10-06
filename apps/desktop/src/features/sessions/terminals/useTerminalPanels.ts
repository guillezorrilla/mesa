import type { ManagedRow, TreeRow } from '@mesa/core';
import { exited } from '@mesa/core/browser';
import { useEffect, useState } from 'react';

/**
 * Embedded terminals, one panel per session, in the order opened; several at once. The selected
 * session's opens with it, and one panel at most is zoomed.
 */
export function useTerminalPanels(
  rows: TreeRow[] | undefined,
  selectedSession: string | undefined,
) {
  const [panels, setPanels] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<string>();
  // A panel goes with its session: once it is not live (stopped, resumed, exited), tmux would
  // show the view another window of the project.
  const liveRows = (rows ?? []).filter((s): s is ManagedRow & TreeRow => s.managed && !exited(s));
  const live = new Set(liveRows.map((s) => s.id));
  if (rows && panels.some((id) => !live.has(id))) setPanels(panels.filter((id) => live.has(id)));
  useEffect(() => {
    const id = selectedSession;
    if (id && rows?.some((row) => row.id === id && row.managed && !exited(row))) {
      setPanels((open) => (open.includes(id) ? open : [...open, id]));
    }
  }, [rows, selectedSession]);
  return {
    panels,
    setPanels,
    /** The live Mesa sessions, which alone may have a panel. */
    liveRows,
    live,
    zoomed,
    setZoomed,
    add: (id: string) => setPanels((open) => (open.includes(id) ? open : [...open, id])),
    close: (id: string) => {
      setPanels((open) => open.filter((p) => p !== id));
      setZoomed((current) => (current === id ? undefined : current));
    },
    toggleZoom: (id: string) => setZoomed((current) => (current === id ? undefined : id)),
  };
}

/** What `useTerminalPanels` returns. */
export type TerminalPanels = ReturnType<typeof useTerminalPanels>;
