import type { ChatItem, ChatMessage, ContextReport, PlanUsage, UsageForm } from '@mesa/core';
import { parseContextReport, parsePlanUsage, parseUsageForm } from '@mesa/core/browser';

/**
 * What a command's card shows: a form for a `key=value` usage list, `/model`'s picker, or the
 * `/usage` and `/context` replies read as data.
 */
export type CommandCard =
  | { kind: 'form'; form: UsageForm }
  | { kind: 'model' }
  | { kind: 'usage'; report: PlanUsage }
  | { kind: 'context'; report: ContextReport };

/** The card a finished command's reply reads as, by the command run; none for any other. */
function replyCard(text: string, output: string): CommandCard | undefined {
  const usage = text === '/usage' ? parsePlanUsage(output) : undefined;
  if (usage) return { kind: 'usage', report: usage };
  const context = text === '/context' ? parseContextReport(output) : undefined;
  return context ? { kind: 'context', report: context } : undefined;
}

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
    const reply = message.output ? replyCard(text, message.output) : undefined;
    if (reply) {
      cards.set(message, { card: reply, replies: [] });
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
