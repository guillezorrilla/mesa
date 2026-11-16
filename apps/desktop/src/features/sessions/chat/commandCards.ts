import type { ChatItem, ChatMessage, UsageForm } from '@mesa/core';
import { parseUsageForm } from '@mesa/core/browser';

/** What a command's card shows: a form for a `key=value` usage list, or `/model`'s picker. */
export type CommandCard = { kind: 'form'; form: UsageForm } | { kind: 'model' };

/** A card and the replies to the changes made from it, oldest first. */
export type PlacedCard = { card: CommandCard; replies: ChatMessage[] };

/** `/config verbose=true` and the like: a command followed by `key=value`. */
const SETS = /^(\/[\w-]+)\s+[\w.-]+=/;

/**
 * Which slash commands in `messages` show as cards (#1218), and the rows each card takes in: a
 * `/cmd key=value` run after a form for `/cmd` answers a change made from that form, so it shows
 * in the newest such card instead of as a row of its own.
 */
export function commandCards(messages: readonly ChatItem[]) {
  const cards = new Map<ChatItem, PlacedCard>();
  const folded = new Set<ChatItem>();
  const newest = new Map<string, PlacedCard>();
  for (const message of messages) {
    if (message.from !== 'command') continue;
    const text = message.text.trim();
    if (text === '/model') {
      cards.set(message, { card: { kind: 'model' }, replies: [] });
      continue;
    }
    const form = message.output ? parseUsageForm(message.output) : undefined;
    if (form) {
      const placed = { card: { kind: 'form' as const, form }, replies: [] };
      cards.set(message, placed);
      newest.set(form.command, placed);
      continue;
    }
    const owner = newest.get(SETS.exec(text)?.[1] ?? '');
    if (!owner) continue;
    owner.replies.push(message);
    folded.add(message);
  }
  return { cards, folded };
}
