import type { ChatItem } from '@mesa/core';

// A slash command sent from Chat, as orca's native chat command marker keeps it: the command,
// when it was sent, and what it showed (here the last frame of its panel), the newest few only.

/** A command sent from Chat and the last frame its panel showed. */
export type CommandMarker = { command: string; sentAt: number; output?: string[] };

/** How many sent commands a chat keeps, as orca's markers. */
export const MAX_MARKERS = 8;
/** How far a transcript's clock may run behind the app's when a command is sent. */
const SKEW_MS = 5_000;

/** A command as typed, its spacing as the transcript writes it (`/model wren`). */
const spaced = (command: string) => command.trim().replace(/\s+/g, ' ');

/** Whether `prompt` is a slash command, which Chat shows as a command card. */
export const isCommand = (prompt: string) => /^\/\S/.test(prompt.trimStart());

/** One row of a chat: a transcript message, with the marker of the command it records, or a marker the transcript does not hold (Codex's commands, or one not written yet). */
export type ChatEntry = { message?: ChatItem; marker?: CommandMarker };

/**
 * The chat's rows: each message, a command row with the marker sent for it, and each marker no
 * row holds placed by when it was sent, before the first message written after it.
 */
export function chatItems(
  messages: readonly ChatItem[],
  markers: readonly CommandMarker[],
): ChatEntry[] {
  const unheld = [...markers];
  const items: ChatEntry[] = messages.map((message) => {
    if (message.from !== 'command') return { message };
    const at = unheld.findIndex(
      (marker) =>
        spaced(marker.command) === spaced(message.text) &&
        (message.at === null || Date.parse(message.at) >= marker.sentAt - SKEW_MS),
    );
    const [marker] = at < 0 ? [] : unheld.splice(at, 1);
    return marker ? { message, marker } : { message };
  });
  for (const marker of unheld) {
    const after = items.findIndex(
      (item) => item.message?.at != null && Date.parse(item.message.at) > marker.sentAt + SKEW_MS,
    );
    items.splice(after < 0 ? items.length : after, 0, { marker });
  }
  return items;
}
