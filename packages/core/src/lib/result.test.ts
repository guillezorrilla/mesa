import { expect, test } from 'vitest';
import { EXIT_CODES, exitCode, fail, MesaError, ok, toFail } from './result.js';

test('ok wraps data', () => {
  expect(ok({ profile: 'default' })).toEqual({ ok: true, data: { profile: 'default' } });
});

test('fail carries code, message, and optional details', () => {
  expect(fail('usage', 'bad')).toEqual({ ok: false, error: { code: 'usage', message: 'bad' } });
  expect(JSON.stringify(fail('usage', 'bad'))).toBe(
    '{"ok":false,"error":{"code":"usage","message":"bad"}}',
  );
  expect(fail('not_found', 'gone', { id: 'x' }).error.details).toEqual({ id: 'x' });
});

test('toFail keeps a MesaError code and maps anything else to internal', () => {
  expect(toFail(new MesaError('tmux_unavailable', 'no tmux')).error).toEqual({
    code: 'tmux_unavailable',
    message: 'no tmux',
  });
  expect(toFail(new Error('boom')).error).toEqual({ code: 'internal', message: 'boom' });
  expect(toFail('text').error.code).toBe('internal');
});

test('exit code map', () => {
  expect(EXIT_CODES).toEqual({
    ok: 0,
    internal: 1,
    usage: 2,
    not_found: 3,
    invalid_config: 4,
    guardrail_blocked: 5,
    tmux_unavailable: 6,
    agent_unavailable: 7,
    locked: 8,
    timeout: 9,
    needs_approval: 10,
  });
  expect(exitCode(ok(null))).toBe(0);
  expect(exitCode(fail('usage', 'x'))).toBe(2);
  expect(exitCode(fail('agent_unavailable', 'x'))).toBe(7);
});
