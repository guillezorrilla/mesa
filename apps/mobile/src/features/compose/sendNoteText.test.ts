import { expect, test } from 'vitest';
import { sendNoteText } from './sendNoteText';

test('the composer names the guardrail ask or block with its reason, a queued reply, and nothing once sent', () => {
  expect(
    sendNoteText({ status: 'ask', reason: 'project lantern-cove has guardrail: strict' }),
  ).toBe('The guardrail asks first: project lantern-cove has guardrail: strict.');
  expect(sendNoteText({ status: 'blocked', reason: 'the text holds a destructive command' })).toBe(
    'The guardrail blocked it: the text holds a destructive command. Nothing was sent.',
  );
  expect(sendNoteText({ status: 'queued' })).toBe('Queued: it is sent when this turn ends.');
  expect(sendNoteText({ status: 'sent' })).toBeUndefined();
});
