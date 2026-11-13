import { expect, test } from 'vitest';
import { sendText } from './sendText';

test('each outcome of Send to the session reads as one sentence', () => {
  expect(sendText({ status: 'delivered', session: 's1' })).toBe(
    'Sent to the session: it has the failed check now.',
  );
  expect(sendText({ status: 'waiting', session: 's1', reason: 'it is working' })).toBe(
    'The session is busy; it gets the failed check when it is idle (it is working).',
  );
  expect(sendText({ status: 'nothing', reason: 'no live session works on this branch' })).toBe(
    'Nothing sent: no live session works on this branch.',
  );
  expect(sendText({ status: 'blocked', reason: 'the guardrail asks first' })).toBe(
    'Not sent (blocked): the guardrail asks first.',
  );
});
