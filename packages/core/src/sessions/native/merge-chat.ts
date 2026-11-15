import type { ChatItem } from './chat.js';

/** What makes two items the same one across the transcript and the stream: a run's id, else who said what. */
const same = (a: ChatItem, b: ChatItem) =>
  a.from === b.from && (a.from === 'steps' ? a.id === b.id : a.text === (b as typeof a).text);

/**
 * The transcript's chat (`history`, oldest first) with the stream's items (`live`, oldest first)
 * after it. The transcript catches up with the stream after a moment, and a resume replays what
 * the stream already showed, so the longest tail of `history` that begins `live` is kept once, as
 * the transcript has it; nothing is reordered.
 */
export function mergeChat(history: ChatItem[], live: ChatItem[]): ChatItem[] {
  for (let overlap = Math.min(history.length, live.length); overlap > 0; overlap--) {
    const tail = history.slice(history.length - overlap);
    if (tail.every((item, i) => same(item, live[i] as ChatItem)))
      return [...history, ...live.slice(overlap)];
  }
  return [...history, ...live];
}
