import { PairingError } from '@mesa/core/phone';

/** What the person reads when a scanned code does not pair. */
export function joinErrorText(error: unknown): string {
  if (!(error instanceof PairingError)) return "Couldn't pair. Try again.";
  if (error.status === 0) return "Couldn't reach Mesa's broker. Check your connection.";
  if (error.status === 410 || error.status === 404)
    return 'This code expired. Show a new one on your Mac.';
  if (error.status === 409) return 'This code was already used. Show a new one on your Mac.';
  if (error.status === 403) return "This code doesn't match. Scan it again.";
  return `Couldn't pair (${error.status}). Try again.`;
}
