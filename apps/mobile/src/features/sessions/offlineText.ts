import { relativeAgo } from '@mesa/core/phone';

/**
 * What the Agents tab says when a Mac does not answer: asleep or offline, and when last heard;
 * `name` names it among several.
 */
export function offlineText(heardAt: number | undefined, now: number, name?: string) {
  const last = heardAt
    ? `Last heard from it ${relativeAgo(new Date(heardAt).toISOString(), now)}.`
    : 'Nothing heard from it since the app opened.';
  return `${name ?? 'Your Mac'} is not answering; it may be asleep or offline. ${last}`;
}
