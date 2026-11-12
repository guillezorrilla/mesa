import type { PhoneStatus } from '@mesa/core';
import { timeAgo } from '@mesa/core/browser';

/**
 * The line under the Phone setting: when it paired and whether the Mac answers the phone, that a
 * code is out, or what pairing gives.
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
    return `Paired${since}${seen}${off}`;
  }
  if (showingCode) return 'Scan the code with the Mesa app on your phone';
  return 'Get pinged on your phone when a session needs you; messages are sealed so the broker cannot read them';
}
