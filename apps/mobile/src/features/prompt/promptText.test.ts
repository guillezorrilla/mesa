import { MacCallError } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { answerErrorText, outcomeText } from './promptText';

test('an answer says what was given, a stale one that the prompt moved on', () => {
  expect(outcomeText({ kind: 'answered', label: 'Allow' })).toBe('Answered: Allow');
  expect(outcomeText({ kind: 'stale' })).toMatch(/^The prompt moved on/);
  expect(outcomeText({ kind: 'failed', text: 'no session x' })).toBe('no session x');
});

test('an answer the Mac did not take in time may still go through; its own error is its words', () => {
  expect(answerErrorText(new MacCallError('timeout', 'late'))).toMatch(
    /goes through when it wakes/,
  );
  expect(answerErrorText(new MacCallError('failed', 'pass an option or --text'))).toBe(
    'pass an option or --text',
  );
});
