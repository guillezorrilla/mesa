import { expect, test } from 'vitest';
import { codexResult } from '../../testing/index.js';
import { readCodexResult } from './result.js';

test('recorded exec streams: warning items, last answer, thread, tokens, and no invented cost', () => {
  const result = readCodexResult(codexResult('success'));
  expect(result).toEqual({
    read: true,
    ok: true,
    output: 'Hi!',
    agentSessionId: '00000000-0000-4000-8000-000000000002',
    usage: {
      input_tokens: 18630,
      cached_input_tokens: 12160,
      cache_write_input_tokens: 0,
      output_tokens: 6,
      reasoning_output_tokens: 0,
    },
  });
  expect(readCodexResult(codexResult('success') + codexResult('skill-stdin'))).toMatchObject({
    ok: true,
    output: 'LANTERN_SKILL_OK TIDE_STDIN_731',
  });
});

test('top-level errors fail, incomplete turns and malformed streams cannot succeed', () => {
  for (const error of [
    { type: 'error', message: 'model unavailable' },
    { type: 'turn.failed', error: { message: 'model unavailable' } },
  ]) {
    expect(readCodexResult(codexResult('success') + JSON.stringify(error))).toMatchObject({
      read: true,
      ok: false,
      reason: 'model unavailable',
    });
  }
  expect(readCodexResult('{"type":"thread.started","thread_id":"invented"}')).toMatchObject({
    read: true,
    ok: false,
    reason: 'codex stopped before its turn completed',
  });
  for (const text of ['', 'bad json', '{"type":"turn.completed","usage":{"input_tokens":-1}}']) {
    expect(readCodexResult(text)).toMatchObject({ read: false, reason: expect.any(String) });
  }
});
