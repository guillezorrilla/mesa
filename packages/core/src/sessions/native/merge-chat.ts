import type { ChatItem } from './chat.js';

/** What makes two items the same one across the transcript and the stream: a run's id or a shared step, else who said what. */
const same = (a: ChatItem, b: ChatItem) =>
  a.from === b.from &&
  (a.from === 'steps' && b.from === 'steps'
    ? a.id === b.id || a.steps.some((step) => b.steps.some((other) => other.id === step.id))
    : a.from !== 'steps' && b.from !== 'steps' && a.text === b.text);

/**
 * The transcript's chat (`history`, oldest first) with the stream's items (`live`, oldest first)
 * after it. The transcript catches up with the stream after a moment, and a resume replays what
 * the stream already showed, so the latest place in `history` where `live` begins is kept once,
 * as the transcript has it, and only the items past the transcript's end are added; nothing is
 * reordered. shortcut: a prompt sent twice in a row reads as one, and an item has no id both
 * sources share; upgrade when the host writes the transcript's revision into the journal.
 */
export function mergeChat(history: ChatItem[], live: ChatItem[]): ChatItem[] {
  const first = live[0];
  if (!first) return history;
  for (let start = history.length - 1; start >= 0; start--) {
    const overlap = Math.min(live.length, history.length - start);
    if (history.slice(start, start + overlap).every((item, i) => same(item, live[i] as ChatItem)))
      return [...history, ...live.slice(overlap)];
  }
  return [...history, ...live];
}
