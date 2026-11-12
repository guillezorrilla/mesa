import { MacCallError } from '@mesa/core/phone';
import { offlineText } from '../sessions/offlineText';
import type { MacLink } from './macLink';

/** A call's answer, or why there is none in words; a read that failed keeps the last answer. */
export type MacRead<T> = { result?: T; error?: string };

/**
 * Runs `run` against the Mac and says why it failed: a Mac that does not answer is offline, as
 * the Agents tab says, and the Mac's own error is its words.
 */
export async function tryCall<T>(link: MacLink, run: () => Promise<T>): Promise<MacRead<T>> {
  try {
    return { result: await run() };
  } catch (error) {
    const offline = error instanceof MacCallError && error.reason !== 'failed';
    return {
      error: offline ? offlineText(await link.lastHeard(), Date.now()) : (error as Error).message,
    };
  }
}

/** `next`, or when it failed, the last answer with `next`'s error: a screen keeps what it showed. */
export const keepLast = async <T extends { error?: string }>(next: T, last?: Promise<T>) =>
  next.error ? { ...(await last), error: next.error } : next;
