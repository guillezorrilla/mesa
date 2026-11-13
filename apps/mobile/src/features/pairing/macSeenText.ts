import type { PairingInfo } from '@mesa/core/phone';

/** The line about a Mac on its card, from what the broker said (or that it can't be reached). */
export function macSeenText(info: PairingInfo | 'unreachable', locale?: string): string {
  if (info === 'unreachable') return "Mesa's broker can't be reached right now.";
  if (!info.macSeenAt) return 'Not checked in since pairing.';
  const at = new Date(info.macSeenAt);
  return `Last checked in ${at.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}.`;
}
