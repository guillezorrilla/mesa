import type { TreeRow } from '@mesa/core';
import { chattable, FIXED_SHORTCUTS, type SESSION_VIEWS } from '@mesa/core/browser';
import { useEffect, useRef } from 'react';
import { useKept } from '@/lib/keptValue';
import { pressed } from '@/lib/shortcutKeys';

export type SessionView = (typeof SESSION_VIEWS)[number];

/**
 * How the selected session shows, Terminal or Chat: its own choice, kept per session on this
 * machine, else the profile's `fallback`. A session with no transcript Mesa reads shows only its
 * Terminal. Cmd+Shift+J toggles it. Either way its agent runs on in its window.
 */
export function useSessionView(row: TreeRow | undefined, fallback: SessionView) {
  const available = Boolean(row && chattable(row));
  const [kept, keep] = useKept(row ? `mesa.sessionView.${row.id}` : undefined);
  const view: SessionView = available && (kept ?? fallback) === 'chat' ? 'chat' : 'terminal';
  const toggle = useRef(() => {});
  toggle.current = () => {
    if (available) keep(view === 'chat' ? 'terminal' : 'chat');
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !pressed(event, FIXED_SHORTCUTS.toggleChat)) return;
      event.preventDefault();
      toggle.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { view, available, choose: (next: SessionView) => keep(next) };
}
