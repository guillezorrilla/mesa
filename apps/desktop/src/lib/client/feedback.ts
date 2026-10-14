import type { FeedbackInput } from '@mesa/core';
import { commandWith } from './spec';

/** Feedback a person writes in the app, sent from the screen it was written on. */
export const feedbackCommands = {
  'feedback.send': commandWith<FeedbackInput, { sent: true }>(({ message, from }) => [
    'feedback',
    `--from=${from}`,
    '--',
    message,
  ]),
};
