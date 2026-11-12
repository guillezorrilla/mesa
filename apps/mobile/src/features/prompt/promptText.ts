import { MacCallError } from '@mesa/core/phone';

/** How an answer from the phone went: the answer given, stale, or why it failed. */
export type AnswerOutcome =
  | { kind: 'answered'; label: string }
  | { kind: 'stale' }
  | { kind: 'failed'; text: string };

/** What the card says for a prompt Mesa does not answer from the phone. */
export const UNSUPPORTED_TITLE = 'Answer it at the Mac';
export const UNSUPPORTED_TEXT = "The session waits on a prompt Mesa can't answer from the phone.";

/** The line under the card after an answer. */
export function outcomeText(outcome: AnswerOutcome) {
  switch (outcome.kind) {
    case 'answered':
      return `Answered: ${outcome.label}`;
    case 'stale':
      return 'The prompt moved on: it was answered at the Mac or replaced. Nothing was sent.';
    case 'failed':
      return outcome.text;
  }
}

/**
 * Why an answer failed. A Mac that does not answer in time may be asleep: the answer waits in the
 * mailbox and goes through when it wakes, if that prompt still waits.
 */
export function answerErrorText(error: unknown) {
  if (error instanceof MacCallError && error.reason === 'timeout')
    return 'Your Mac has not answered; it may be asleep. Your answer goes through when it wakes, if the prompt still waits.';
  return error instanceof Error ? error.message : String(error);
}
