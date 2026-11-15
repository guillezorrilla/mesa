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
 * reordered. Live items older than the transcript's window are left out with it. shortcut: a prompt sent twice in a row reads as one, and an item has no id both
 * sources share; upgrade when the host writes the transcript's revision into the journal.
 */
export function mergeChat(history: ChatItem[], live: ChatItem[]): ChatItem[] {
  const first = live[0];
  if (!first) return history;
  const matches = (at: number, from: number, length: number) =>
    history.slice(at, at + length).every((item, i) => same(item, live[from + i] as ChatItem));
  for (let start = history.length - 1; start >= 0; start--) {
    const overlap = Math.min(live.length, history.length - start);
    if (matches(start, 0, overlap)) return [...history, ...live.slice(overlap)];
  }
  // The stream began before the transcript's window (a long session, or a small count): what
  // came before the window stays out, as the transcript leaves it out.
  for (let from = 1; from < live.length && history.length; from++) {
    const overlap = Math.min(history.length, live.length - from);
    if (matches(0, from, overlap)) return [...history, ...live.slice(from + overlap)];
  }
  return [...history, ...live];
}
