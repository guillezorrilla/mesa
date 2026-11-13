import { expect, test } from 'vitest';
import { deliveryText } from './deliveryText';

test('a delivery says it reached the agent, may not have, or why it was not sent', () => {
  expect(deliveryText({ status: 'delivered' })).toBe('Sent to the agent.');
  expect(deliveryText({ status: 'uncertain' })).toBe('It may not have reached the agent.');
  expect(deliveryText({ status: 'failed', reason: 'the guardrail asks first' })).toBe(
    'Not sent: the guardrail asks first',
  );
});
