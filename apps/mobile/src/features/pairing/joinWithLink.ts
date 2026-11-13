import {
  type Fetch,
  joinPairing,
  type PhonePairing,
  pairingClient,
  parsePairingLink,
} from '@mesa/core/phone';
import type { Feel } from '@/lib/hapticPlayer';
import { joinErrorText } from './joinErrorText';

export type JoinResult =
  | { pairing: PhonePairing; error?: never }
  | { pairing?: never; error: string };

/**
 * Pairs with the Mac a scanned or pasted link names, or says why it could not, and confirms either
 * with `feel` (lib/haptics): success when paired, error when not.
 */
export async function joinWithLink(
  fetch: Fetch,
  text: string,
  now: Date,
  feel: (feel: Feel) => void,
): Promise<JoinResult> {
  const result = await join(fetch, text, now);
  feel(result.pairing ? 'success' : 'error');
  return result;
}

async function join(fetch: Fetch, text: string, now: Date): Promise<JoinResult> {
  const link = parsePairingLink(text);
  if (!link) return { error: "That isn't a Mesa pairing code." };
  try {
    return { pairing: await joinPairing(pairingClient(fetch, link.broker), link, now) };
  } catch (error) {
    return { error: joinErrorText(error) };
  }
}
