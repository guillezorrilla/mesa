import type { SlashCommand } from '@mesa/core';
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { useCall } from '@/lib/useCommand';
import { completion, slashGroups, slashQuery } from './slashMatches';

/**
 * The slash menu's state for a composer holding `text` in session `session`: the groups to show
 * (none while closed), the highlighted command, and a key handler for the textarea that moves,
 * completes (Enter or Tab) or closes (Esc). `setText` receives the completed text.
 */
export function useSlashMenu(session: string, text: string, setText: (text: string) => void) {
  const call = useCall();
  const [loaded, setLoaded] = useState<{ session: string; list: SlashCommand[] }>();
  // Another session's list is never shown for this one while its own loads.
  const commands = loaded?.session === session ? loaded.list : [];
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState<string>();
  const query = slashQuery(text);
  const wanted = query !== undefined;
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    void call('commands.list', { target: session }).then((r) => {
      if (live && r.ok) setLoaded({ session, list: r.data });
    });
    return () => {
      live = false;
    };
  }, [wanted, session, call]);
  // A new query starts at the top.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on query
  useEffect(() => setIndex(0), [query]);
  const groups = useMemo(
    () => (query === undefined || dismissed === text ? [] : slashGroups(commands, query)),
    [commands, query, dismissed, text],
  );
  const flat = groups.flatMap((g) => g.items);
  const active = flat[Math.min(index, flat.length - 1)];
  const pick = (c: SlashCommand) => {
    const done = completion(c);
    setText(done);
    // The completed text still matches itself: keep the menu shut until the person types again.
    setDismissed(done);
    setIndex(0);
  };
  const onKeyDown = (e: KeyboardEvent): boolean => {
    // Already completed: Enter sends it.
    if (!flat.length || (active && completion(active) === text && e.key !== 'Escape')) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const step = e.key === 'ArrowDown' ? 1 : flat.length - 1;
      setIndex((i) => (Math.min(i, flat.length - 1) + step) % flat.length);
    } else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && active) pick(active);
    else if (e.key === 'Escape') setDismissed(text);
    else return false;
    e.preventDefault();
    return true;
  };
  return { groups, active, pick, onKeyDown };
}
