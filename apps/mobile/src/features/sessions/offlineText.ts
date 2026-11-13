import { relativeAgo } from '@mesa/core/phone';

/** A Mac heard from this recently that does not answer is slow (loaded), not asleep or offline. */
const SLOW_MS = 60_000;

/**
 * What a screen says when a Mac does not answer: slow when it was heard in the last minute, else
 * asleep or offline, and when last heard; `name` names it among several.
 */
export function offlineText(heardAt: number | undefined, now: number, name?: string) {
  const last = heardAt
    ? `Last heard from it ${relativeAgo(new Date(heardAt).toISOString(), now)}.`
    : 'Nothing heard from it since the app opened.';
  const mac = name ?? 'Your Mac';
  if (heardAt !== undefined && now - heardAt < SLOW_MS) return `${mac} is slow to answer. ${last}`;
  return `${mac} is not answering; it may be asleep or offline. ${last}`;
}
