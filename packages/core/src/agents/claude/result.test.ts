import { expect, test } from 'vitest';
import { claudeResult } from '../../testing/index.js';
import { readClaudeResult } from './result.js';

const ID = '00000000-0000-4000-8000-000000000001';

test('a finished run: its answer, conversation, cost, and duration', () => {
  expect(readClaudeResult(claudeResult('success'))).toEqual({
    read: true,
    ok: true,
    output: expect.stringMatching(/^\*\*Goal:\*\* Tidy the lantern-cove README\./),
    agentSessionId: ID,
    costUsd: 0.0421,
    durationMs: 8421,
  });
});

test('an error claude reports is not ok, with its own words as the reason', () => {
  // Recorded: a success subtype, and is_error all the same.
  expect(readClaudeResult(claudeResult('not-logged-in'))).toEqual({
    read: true,
    ok: false,
    output: 'Not logged in · Please run /login',
    agentSessionId: ID,
    costUsd: 0,
    durationMs: 68,
    reason: 'Not logged in · Please run /login',
  });
  const stopped = { ...JSON.parse(claudeResult('success')), subtype: 'error_max_turns' };
  delete stopped.result;
  delete stopped.total_cost_usd;
  expect(readClaudeResult(JSON.stringify(stopped))).toEqual({
    read: true,
    ok: false,
    output: '',
    agentSessionId: ID,
    durationMs: 8421,
    reason: 'claude stopped before it finished (error_max_turns)',
  });
});

test('output that is not a result says why, and never throws', () => {
  expect(readClaudeResult(' \n')).toEqual({ read: false, reason: 'claude printed no result' });
  expect(readClaudeResult('error: unknown option')).toEqual({
    read: false,
    reason: 'claude printed something other than its JSON result',
  });
  expect(readClaudeResult('{"type":"assistant"}')).toEqual({
    read: false,
    reason: 'claude printed JSON that is not a result',
  });
});
