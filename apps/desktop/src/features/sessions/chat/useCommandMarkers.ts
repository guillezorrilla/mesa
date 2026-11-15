import { useEffect, useState } from 'react';
import type { SentPrompt } from '../selected/useSessionPrompt';
import { type CommandMarker, isCommand, MAX_MARKERS } from './commandMarkers';
import { useCommandPanel } from './useCommandPanel';

/**
 * The slash commands sent from this chat (orca's markers, the newest MAX_MARKERS), each with the
 * last frame its panel showed; the newest is `live` while it is the last prompt sent, and its
 * panel is read (useCommandPanel). `frames` counts frames taken, so the view can follow them.
 */
export function useCommandMarkers(sessionId: string, sent: SentPrompt | undefined) {
  const [list, setList] = useState<CommandMarker[]>([]);
  const [frames, setFrames] = useState(0);
  useEffect(() => {
    if (!sent || sent.id !== sessionId || !isCommand(sent.prompt)) return;
    setList((kept) =>
      kept.some((marker) => marker.sentAt === sent.at)
        ? kept
        : [...kept, { command: sent.prompt.trim(), sentAt: sent.at }].slice(-MAX_MARKERS),
    );
  }, [sent, sessionId]);
  const newest = list.at(-1);
  const live = newest && sent?.at === newest.sentAt ? newest : undefined;
  useCommandPanel(sessionId, live, (lines) => {
    if (live?.output?.join('\n') === lines.join('\n')) return;
    setList((kept) =>
      kept.map((marker) =>
        marker.sentAt === live?.sentAt ? { ...marker, output: lines } : marker,
      ),
    );
    setFrames((count) => count + 1);
  });
  return { list, live, frames };
}
