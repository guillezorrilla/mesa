import { agentLabel, type PhoneConversation, shortAgo } from '@mesa/core/phone';

/** A conversation's second line: its project, agent and age. */
export function conversationDetail(c: PhoneConversation, now: number) {
  return [c.project, agentLabel(c.agent), c.at && shortAgo(c.at, now)].filter(Boolean).join(' · ');
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

/** What the search bar's text searches for: 2 characters at least, as the Mac searches; else none. */
export const searchQuery = (text: string) => (text.trim().length < 2 ? '' : text.trim());
