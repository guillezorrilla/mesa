import { useEffect, useRef } from 'react';
import { useCall } from '@/lib/useCommand';
import { useWindowFocused } from '@/lib/useWindowFocused';
import type { CommandMarker } from './commandMarkers';

/** How often a live command card reads its panel. */
const PANEL_POLL_MS = 1_000;
/** How long after it was sent a command card stays live. */
const LIVE_FOR_MS = 10 * 60_000;

/**
 * Reads the panel live command `live` shows in session `sessionId`'s pane about every second
 * while the app has focus, for up to LIVE_FOR_MS, and hands each frame that shows something to
 * `onFrame`; an empty one (the panel closed, its echo gone) keeps the last.
 */
export function useCommandPanel(
  sessionId: string,
  live: Pick<CommandMarker, 'command' | 'sentAt'> | undefined,
  onFrame: (lines: string[]) => void,
) {
  const command = live?.command;
  const sentAt = live?.sentAt;
  const call = useCall();
  const focused = useWindowFocused();
  const frame = useRef(onFrame);
  frame.current = onFrame;
  useEffect(() => {
    if (!command || sentAt === undefined || !focused || Date.now() - sentAt > LIVE_FOR_MS) return;
    let reading = false;
    const read = async () => {
      if (reading) return;
      reading = true;
      const shown = await call('sessions.panel', { id: sessionId, command });
      reading = false;
      if (shown.ok && shown.data.lines.length) frame.current(shown.data.lines);
    };
    void read();
    const timer = window.setInterval(() => void read(), PANEL_POLL_MS);
    const stop = window.setTimeout(
      () => window.clearInterval(timer),
      LIVE_FOR_MS - (Date.now() - sentAt),
    );
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [call, sessionId, command, sentAt, focused]);
}
