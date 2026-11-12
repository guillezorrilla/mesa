import { AGENT_LABELS, type PhoneConversation, shortAgo } from '@mesa/core/phone';

/** A conversation's second line: its project, agent and age. */
export function conversationDetail(c: PhoneConversation, now: number) {
  const agent = AGENT_LABELS[c.agent as keyof typeof AGENT_LABELS] ?? c.agent;
  return [c.project, agent, c.at && shortAgo(c.at, now)].filter(Boolean).join(' · ');
}

/** What a tap does: open the Mesa session it already is, resume it, or nothing (another profile's). */
export const conversationAction = (c: PhoneConversation) =>
  c.importedAs ? 'Open' : c.elsewhere ? 'Other profile' : 'Resume';

/** What the list says when it shows nothing, and when it shows only part. */
export function historyNote(query: string, count: number, partial: boolean) {
  if (!count)
    return query ? `No conversation says "${query}".` : 'No past conversations on your Mac.';
  return partial ? `The newest ${count} shown.` : undefined;
}
