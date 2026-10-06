import { expect, test } from 'vitest';
import { newSession } from '../../testing/index.js';
import type { SessionRecord } from '../record/record.js';
import { hasConversation } from './conversation.js';

const at = '2026-09-24T12:00:00.000Z';
const record = (extra: Partial<SessionRecord> = {}) =>
  ({ ...newSession(), id: 'aaaaaaaa', events: [], ...extra }) as SessionRecord;

test('a session has a conversation once it has a goal, a prompt Mesa sent, or a prompt hook', () => {
  expect(hasConversation(record(), [])).toBe(false);
  // Its agent starting, or a blank goal, is no conversation.
  expect(
    hasConversation(record({ goal: '  ' }), [
      { at, agent: 'claude', event: 'SessionStart', payload: {} },
    ]),
  ).toBe(false);
  expect(hasConversation(record({ goal: 'Say hi' }), [])).toBe(true);
  expect(hasConversation(record({ events: [{ type: 'send', at, chars: 5 }] }), [])).toBe(true);
  expect(
    hasConversation(record(), [{ at, agent: 'claude', event: 'UserPromptSubmit', payload: {} }]),
  ).toBe(true);
});
