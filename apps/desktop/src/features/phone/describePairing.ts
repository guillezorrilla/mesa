import type { PhoneStatus } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';

/**
 * The line under the Phone setting: when it paired, whether the Mac answers the phone and on which
 * Mesa when an older one still does, that a code is out, or what pairing gives.
 */
export function describePairing(
  status: PhoneStatus | undefined,
  showingCode: boolean,
  now: number,
) {
  if (status?.paired) {
    const since = status.since ? ` ${timeAgo(status.since, now)}` : '';
    const seen = status.phoneLastSeen
      ? `, phone last seen ${timeAgo(status.phoneLastSeen, now)}`
      : '';
    const off =
      status.listening === false ? '; the Mac is not answering it (mesa phone serve)' : '';
    const old = status.listenerOutdated
      ? `; the Mac answers it with Mesa ${status.listenerVersion}, not this version`
      : '';
    return `Paired${since}${seen}${off}${old}`;
  }
  if (showingCode) return 'Scan the code with the Mesa app on your phone';
  return 'Get pinged on your phone when a session needs you; messages are sealed so the broker cannot read them';
}
