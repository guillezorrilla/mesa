import {
  type Fetch,
  joinPairing,
  type PhonePairing,
  pairingClient,
  parsePairingLink,
} from '@mesa/core/phone';
import { joinErrorText } from './joinErrorText';

export type JoinResult =
  | { pairing: PhonePairing; error?: never }
  | { pairing?: never; error: string };

/** Pairs with the Mac a scanned or pasted link names, or says why it could not. */
export async function joinWithLink(fetch: Fetch, text: string, now: Date): Promise<JoinResult> {
  const link = parsePairingLink(text);
  if (!link) return { error: "That isn't a Mesa pairing code." };
  try {
    return { pairing: await joinPairing(pairingClient(fetch, link.broker), link, now) };
  } catch (error) {
    return { error: joinErrorText(error) };
  }
}
