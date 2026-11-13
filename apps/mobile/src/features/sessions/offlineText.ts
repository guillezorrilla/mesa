import { relativeAgo } from '@mesa/core/phone';

/** A Mac heard from this recently that does not answer is slow (loaded), not asleep or offline. */
const SLOW_MS = 60_000;

/**
 * What a screen says when the Mac does not answer: slow when it was heard in the last minute,
 * else asleep or offline, and when last heard.
 */
export function offlineText(heardAt: number | undefined, now: number) {
  const last = heardAt
    ? `Last heard from it ${relativeAgo(new Date(heardAt).toISOString(), now)}.`
    : 'Nothing heard from it since the app opened.';
  if (heardAt !== undefined && now - heardAt < SLOW_MS)
    return `Your Mac is slow to answer. ${last}`;
  return `Your Mac is not answering; it may be asleep or offline. ${last}`;
}
