import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { antigravityLog, antigravitySessionId } from './log.js';
import { readAntigravityResult } from './result.js';
import { antigravityLastOutputLine, antigravityScreenState } from './screen.js';

const A = '002f58d1-9e29-4682-9bc1-3a2dc5da1115';
const B = 'cd66cf01-f466-4c11-8f12-a8fd0885d9f4';

test('one window reads only its own native conversation ID, even in a shared checkout', () => {
  const logs = join(tempDir(), 'logs');
  mkdirSync(logs);
  writeFileSync(antigravityLog(logs, 'aaaaaaaa'), `Created conversation ${A}\n`);
  writeFileSync(antigravityLog(logs, 'bbbbbbbb'), `Created conversation ${B}\n`);
  const read = (id: string, taken: string[] = []) =>
    antigravitySessionId({ logs }, { id }, new Set(taken));
  expect(read('aaaaaaaa')).toBe(A);
  expect(read('bbbbbbbb')).toBe(B);
  expect(read('aaaaaaaa', [A])).toBeUndefined();
  expect(read('cccccccc')).toBeUndefined();
  writeFileSync(
    antigravityLog(logs, 'aaaaaaaa'),
    `Created conversation ${A}\nCreated conversation ${B}\n`,
  );
  expect(read('aaaaaaaa')).toBe(A);
  expect(antigravitySessionId({ logs }, { id: 'aaaaaaaa' }, new Set(), true)).toBe(B);
  writeFileSync(antigravityLog(logs, 'dddddddd'), 'Created conversation x; echo injected\n');
  expect(read('dddddddd')).toBeUndefined();
});

test('the JSON headless result preserves native ID and usage, and rejects uncertain outcomes', () => {
  const success = JSON.stringify({
    conversation_id: A,
    status: 'SUCCESS',
    response: 'READY\n',
    duration_seconds: 3.314,
    num_turns: 1,
    usage: { input_tokens: 14693, output_tokens: 1, total_tokens: 14694 },
  });
  expect(readAntigravityResult(success)).toMatchObject({
    read: true,
    ok: true,
    agentSessionId: A,
    output: 'READY\n',
    durationMs: 3314,
    usage: { input_tokens: 14693, output_tokens: 1 },
  });
  expect(readAntigravityResult(success.replace('SUCCESS', 'WAITING'))).toMatchObject({
    read: true,
    ok: false,
    reason: 'agy ended with WAITING',
  });
  expect(readAntigravityResult(success.replace('READY\\n', ''))).toMatchObject({
    read: true,
    ok: false,
    agentSessionId: A,
    reason: 'agy returned no response; check its stderr for denied tools',
  });
  expect(readAntigravityResult('{')).toEqual({
    read: false,
    reason: 'agy printed an invalid result',
  });
});

test('only observed TUI markers claim state', () => {
  expect(antigravityScreenState('Do you trust the contents of this project?')).toBe(
    'waiting-question',
  );
  expect(antigravityScreenState('⡿ Generating...\n? for shortcuts')).toBe('working');
  expect(antigravityScreenState('>\n? for shortcuts')).toBe('idle');
  expect(antigravityScreenState('unknown screen')).toBeUndefined();
  expect(antigravityLastOutputLine('> Reply ALIVE\n\n  ALIVE\n──\n>\n? for shortcuts')).toBe(
    'ALIVE',
  );
});
