import { relativeAgo } from '@mesa/core/phone';

/** What the Agents tab says when the Mac does not answer: asleep or offline, and when last heard. */
export function offlineText(heardAt: number | undefined, now: number) {
  const last = heardAt
    ? `Last heard from it ${relativeAgo(new Date(heardAt).toISOString(), now)}.`
    : 'Nothing heard from it since the app opened.';
  return `Your Mac is not answering; it may be asleep or offline. ${last}`;
}
