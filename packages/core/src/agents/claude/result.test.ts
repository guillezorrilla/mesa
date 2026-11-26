import { expect, test } from 'vitest';
import { claudeResult } from '../../testing/index.js';
import { readClaudeResult, readClaudeStream } from './result.js';

const ID = '00000000-0000-4000-8000-000000000001';

test('a finished run: its answer, conversation, cost, and duration', () => {
  expect(readClaudeResult(claudeResult('success'))).toEqual({
    read: true,
    ok: true,
    output: expect.stringMatching(/^The session had no work to summarise/),
    agentSessionId: ID,
    costUsd: 0.2621986,
    durationMs: 19113,
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
    durationMs: 19113,
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

/** A stream-json run's lines: two assistant messages, a tool call between, the result last. */
const delta = (text: string, parent: string | null = null) =>
  JSON.stringify({
    type: 'stream_event',
    parent_tool_use_id: parent,
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });
const start = JSON.stringify({ type: 'stream_event', event: { type: 'message_start' } });
const STREAM = [
  JSON.stringify({ type: 'system', subtype: 'init' }),
  start,
  delta('Checking the '),
  delta('errors.'),
  start,
  delta('noise', 'toolu_1'),
  delta('Berth 7 '),
  delta('is missing.'),
];

test('a streaming run shows its newest message so far, a subagent left out, and its result reads from the last line', () => {
  expect(readClaudeStream(STREAM.slice(0, 4).join('\n'))).toBe('Checking the errors.');
  expect(readClaudeStream(`${STREAM.join('\n')}\n{"type":"stream_ev`)).toBe('Berth 7 is missing.');
  expect(readClaudeStream('')).toBe('');
  const result = readClaudeResult(
    [...STREAM, JSON.stringify(JSON.parse(claudeResult('success')))].join('\n'),
  );
  expect(result).toMatchObject({ read: true, ok: true });
  expect(readClaudeResult(STREAM.join('\n'))).toMatchObject({ read: false });
});
