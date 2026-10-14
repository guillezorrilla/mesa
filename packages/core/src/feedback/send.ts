import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';

/** The longest feedback the broker takes, after trimming (ADR-0025): the broker's MESSAGE_MAX. */
export const FEEDBACK_MAX = 5000;

export type FeedbackInput = {
  message: string;
  /** Where it was written: the app screen's kind; `cli` when not given. */
  from?: string;
};

/**
 * Sends a person's feedback through the broker, which opens it as an issue in a private repo
 * (ADR-0025), with this Mesa's version and build. Keeps nothing and writes no receipt.
 */
export async function sendFeedback(
  deps: { http: Http; broker: string; version: string; build: string },
  { message, from = 'cli' }: FeedbackInput,
): Promise<{ sent: true }> {
  const text = message.trim();
  if (!text) throw new MesaError('usage', 'feedback needs a message');
  if (text.length > FEEDBACK_MAX)
    throw new MesaError('usage', `feedback is at most ${FEEDBACK_MAX} characters`);
  const response = await deps
    .http(`${deps.broker}/feedback`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, version: deps.version, build: deps.build, from }),
    })
    .catch(() => undefined);
  if (response?.status === 429)
    throw new MesaError(
      'internal',
      "Couldn't send feedback: too many sent, wait a minute and try again",
    );
  if (!response?.ok)
    throw new MesaError('internal', "Couldn't send feedback, check your connection and try again");
  return { sent: true };
}
