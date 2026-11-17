import type { ManagedRow, TreeRow } from '@mesa/core';
import { asleep, exited } from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';

/**
 * Hidden terminals kept attached besides the selected one, the most recently selected first:
 * each holds a tmux client, its scrollback and its renderer in the web view (18 kept for days
 * reached 725 MB, docs/spikes/app-efficiency.md). One closed for it attaches again from tmux's
 * history when its session is selected.
 */
export const KEPT_HIDDEN = 3;

/**
 * Embedded terminals, one panel per session, in the order opened; several at once. The selected
 * session's opens with it, and one panel at most is zoomed. Outside the Grid, whose tiles are the
 * panels, a selection closes the hidden ones it opened beyond the KEPT_HIDDEN selected most
 * recently; a panel open while the Grid showed stays until it is closed.
 */
export function useTerminalPanels(
  rows: TreeRow[] | undefined,
  selectedSession: string | undefined,
  gridMode = false,
) {
  const [panels, setPanels] = useState<string[]>([]);
  const [zoomed, setZoomed] = useState<string>();
  /** Sessions in the order they were last selected, the latest last. */
  const recent = useRef<string[]>([]);
  /** The panels a selection opened outside the Grid: the only ones the cap closes. */
  const bySelection = useRef(new Set<string>());
  // A panel goes with its session: once it is not live (stopped, resumed, exited), tmux would
  // show the view another window of the project.
  const liveRows = (rows ?? []).filter(
    (s): s is ManagedRow & TreeRow => s.managed && !exited(s) && !asleep(s),
  );
  const live = new Set(liveRows.map((s) => s.id));
  if (rows && panels.some((id) => !live.has(id))) setPanels(panels.filter((id) => live.has(id)));
  useEffect(() => {
    // The Grid's tiles are the panels: what is open while it shows is its own, never capped.
    if (gridMode) bySelection.current.clear();
    const id = selectedSession;
    if (!id || !rows?.some((row) => row.id === id && row.managed && !exited(row))) return;
    // Only the latest few matter; the rest would only grow.
    recent.current = [...recent.current.filter((each) => each !== id), id].slice(
      -(KEPT_HIDDEN + 1),
    );
    setPanels((open) => {
      const next = open.includes(id) ? open : [...open, id];
      if (gridMode) return next;
      if (!open.includes(id)) bySelection.current.add(id);
      const kept = new Set(recent.current);
      const closed = next.filter((each) => bySelection.current.has(each) && !kept.has(each));
      for (const each of closed) bySelection.current.delete(each);
      return closed.length ? next.filter((each) => !closed.includes(each)) : next;
    });
  }, [rows, selectedSession, gridMode]);
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
