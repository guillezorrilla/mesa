import { expect, test } from 'vitest';
import { outcomeFeel } from './outcomeFeel';

test('a reply sent or queued, a prompt answered, a session started and a branch merged land with success', () => {
  for (const status of ['sent', 'queued', 'answered', 'started'])
    expect(outcomeFeel({ status })).toBe('success');
  expect(outcomeFeel({ merged: true })).toBe('success');
});

test("the guardrail's ask or block, a stale prompt and a merge conflicts stopped are warnings", () => {
  for (const status of ['ask', 'blocked', 'stale']) expect(outcomeFeel({ status })).toBe('warning');
  expect(outcomeFeel({ merged: false })).toBe('warning');
});
