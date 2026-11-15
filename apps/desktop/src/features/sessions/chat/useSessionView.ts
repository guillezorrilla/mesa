import type { TreeRow } from '@mesa/core';
import {
  chattable,
  FIXED_SHORTCUTS,
  inTurn,
  type SESSION_VIEWS,
  switchable,
} from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { warningOf } from '@/components/Toast';
import { useKept } from '@/lib/keptValue';
import { pressed } from '@/lib/shortcutKeys';
import { useRun } from '@/lib/useCommand';
import type { SessionAct } from '../useSessionAct';

type SessionView = (typeof SESSION_VIEWS)[number];
type Shown = 'terminal' | 'chat';

/**
 * How the selected session shows, Terminal or Chat. A live Claude Code session's view is its own
 * (ADR-0029): choosing switches its agent between Terminal and Structured (shown as Chat), with
 * `switching` set meanwhile, and mid-turn it asks first (`asking`, then `confirm` or `cancel`).
 * Another session keeps a choice per session on this machine, else the profile's `fallback`; one
 * with no transcript Mesa reads shows only its Terminal. Cmd+Shift+J toggles it.
 */
export function useSessionView(row: TreeRow | undefined, fallback: SessionView, act: SessionAct) {
  const run = useRun();
  const switches = Boolean(row && switchable(row));
  const available = Boolean(row && chattable(row));
  const [kept, keep] = useKept(row ? `mesa.sessionView.${row.id}` : undefined);
  const [switching, setSwitching] = useState<Shown>();
  const [asking, setAsking] = useState<Shown>();
  const chosen = kept ?? fallback;
  const view: Shown = switches
    ? row?.managed && row.view === 'structured'
      ? 'chat'
      : 'terminal'
    : available && (chosen === 'chat' || chosen === 'structured')
      ? 'chat'
      : 'terminal';
  const switchTo = (next: Shown, interrupt = false) => {
    if (!row) return;
    setAsking(undefined);
    setSwitching(next);
    const view = next === 'chat' ? 'structured' : 'terminal';
    // Cleared once the look after it ends, so the control never shows the old view in between.
    void act(async () =>
      warningOf(await run('sessions.view', { id: row.id, view, interrupt })),
    ).finally(() => setSwitching(undefined));
  };
  const choose = (next: Shown) => {
    if (!switches) return keep(next);
    if (next === view || switching) return;
    if (row && inTurn(row)) setAsking(next);
    else switchTo(next);
  };
  const toggle = useRef(() => {});
  toggle.current = () => {
    if (available) choose(view === 'chat' ? 'terminal' : 'chat');
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
  return {
    view: switching ?? view,
    available,
    switching: Boolean(switching),
    asking,
    choose,
    confirm: () => asking && switchTo(asking, true),
    cancel: () => setAsking(undefined),
  };
}
