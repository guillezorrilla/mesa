import { MacCallError } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { answerErrorText, noteShown, outcomeText } from './promptText';

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

test('a note shows beside its prompt; then a stale one, and an answer while none waits', () => {
  const answered = { outcome: { kind: 'answered', label: 'Allow' }, at: 't1' } as const;
  expect(noteShown(answered, true, 't1')).toBe(true);
  expect(noteShown(answered, false, 't2')).toBe(true);
  expect(noteShown(answered, true, 't2')).toBe(false);
  expect(noteShown({ outcome: { kind: 'stale' }, at: 't1' }, true, 't2')).toBe(true);
  const failed = { outcome: { kind: 'failed', text: 'late' }, at: 't1' } as const;
  expect(noteShown(failed, true, 't1')).toBe(true);
  expect(noteShown(failed, false, 't2')).toBe(false);
});
