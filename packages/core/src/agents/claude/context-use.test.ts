import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { claudeContext, nativeWindow } from './context-use.js';
import { claudeSettings, claudeTranscripts } from './paths.js';
import { lastUsage } from './transcripts.js';

const fixture = (name: string) => join(import.meta.dirname, 'fixtures/transcripts', name);
const ID = '36c173f2-803e-4845-bd97-a032b37c6d6d';

/** A home whose Claude Code keeps `name` as the transcript of session ID. */
function homeWith(name?: string) {
  const home = tempDir();
  const folder = join(claudeTranscripts(home, {}), '-src-lantern-cove');
  mkdirSync(folder, { recursive: true });
  if (name) copyFileSync(fixture(name), join(folder, `${ID}.jsonl`));
  return home;
}

test('a normal turn: the main chain last reply input tokens, in percent of its window', () => {
  // 6 + 2,318 + 40,000 input tokens of a 200k window; output and a subagent's reply do not count.
  expect(claudeContext({ home: homeWith('normal-turn.jsonl'), env: {} }, ID)).toEqual({
    used: 21.16,
    window: 200_000,
    at: '2026-09-25T10:00:09.000Z',
    source: 'transcript',
    model: 'claude-haiku-4-5-20251001',
  });
});

test('the reply carries its native per-turn effort with the model and usage', () => {
  const home = homeWith();
  writeFileSync(
    join(claudeTranscripts(home, {}), '-src-lantern-cove', `${ID}.jsonl`),
    `${JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-25T10:00:09.000Z',
      effort: 'high',
      perTurnEffort: 'xhigh',
      message: { model: 'claude-opus-5-5', usage: { input_tokens: 50_000 } },
    })}\n`,
  );
  expect(claudeContext({ home, env: {} }, ID)).toMatchObject({
    used: 5,
    model: 'claude-opus-5-5',
    effort: 'xhigh',
  });
});

test('after a compaction there is no reading, until the next reply', () => {
  expect(claudeContext({ home: homeWith('after-compaction.jsonl'), env: {} }, ID)).toBeUndefined();
  expect(
    claudeContext({ home: homeWith('reply-after-compaction.jsonl'), env: {} }, ID),
  ).toMatchObject({ used: 20.79, at: '2026-09-25T10:06:04.000Z' });
});

test('a missing transcript, or one with no reply yet, gives no reading and no error', () => {
  expect(claudeContext({ home: homeWith(), env: {} }, ID)).toBeUndefined();
  expect(claudeContext({ home: tempDir(), env: {} }, ID)).toBeUndefined();
  const home = homeWith();
  writeFileSync(
    join(claudeTranscripts(home, {}), '-src-lantern-cove', `${ID}.jsonl`),
    '{"type":"user","message":{"content":"hello"}}\n',
  );
  expect(claudeContext({ home, env: {} }, ID)).toBeUndefined();
});

test('the window comes from the model; unknown models give no reading', () => {
  expect(nativeWindow('claude-opus-5-5')).toBe(1_000_000);
  expect(nativeWindow('claude-opus-4-7')).toBe(1_000_000);
  expect(nativeWindow('claude-opus-4-1-20250805')).toBe(200_000);
  expect(nativeWindow('claude-sonnet-5')).toBe(1_000_000);
  expect(nativeWindow('claude-sonnet-4-20250514')).toBe(200_000);
  expect(nativeWindow('claude-sonnet-4-5-20250929')).toBe(200_000);
  expect(nativeWindow('claude-haiku-4-5-20251001')).toBe(200_000);
  expect(nativeWindow('claude-fable-5-1')).toBe(1_000_000);
  expect(nativeWindow('claude-3-5-sonnet-20241022')).toBeUndefined();
  expect(nativeWindow('gpt-5')).toBeUndefined();
});

test('a native-1M model is held to 200k by the environment or by Claude Code settings', () => {
  const home = homeWith();
  const file = join(claudeTranscripts(home, {}), '-src-lantern-cove', `${ID}.jsonl`);
  const reply = (model: string) =>
    `${JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-25T10:00:09.000Z',
      message: { model, usage: { input_tokens: 45_656 } },
    })}\n`;
  writeFileSync(file, reply('claude-opus-5-5'));
  expect(claudeContext({ home, env: {} }, ID)).toMatchObject({ used: 4.57, window: 1_000_000 });
  const held = { home, env: { CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' } };
  expect(claudeContext(held, ID)).toMatchObject({ used: 22.83, window: 200_000 });
  expect(claudeContext({ home, env: { CLAUDE_CODE_DISABLE_1M_CONTEXT: '0' } }, ID)?.window).toBe(
    1_000_000,
  );
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    claudeSettings(home, {}),
    JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: '1' } }),
  );
  expect(claudeContext({ home, env: {} }, ID)?.window).toBe(200_000);
  writeFileSync(file, reply('claude-3-5-sonnet-20241022'));
  expect(claudeContext({ home, env: {} }, ID)).toBeUndefined();
});

test('with CLAUDE_CONFIG_DIR set, the settings env is read there and never from ~/.claude', () => {
  const home = tempDir();
  const env = { CLAUDE_CONFIG_DIR: join(home, 'config/claude') };
  const folder = join(claudeTranscripts(home, env), '-src-lantern-cove');
  mkdirSync(folder, { recursive: true });
  writeFileSync(
    join(folder, `${ID}.jsonl`),
    JSON.stringify({
      type: 'assistant',
      timestamp: '2026-09-25T10:00:09.000Z',
      message: { model: 'claude-opus-5-5', usage: { input_tokens: 45_656 } },
    }),
  );
  // A decoy in ~/.claude that would hold the window to 200k.
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(
    claudeSettings(home, {}),
    JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: '1' } }),
  );
  expect(claudeContext({ home, env }, ID)?.window).toBe(1_000_000);
  writeFileSync(
    claudeSettings(home, env),
    JSON.stringify({ env: { CLAUDE_CODE_USE_BEDROCK: '1' } }),
  );
  expect(claudeContext({ home, env }, ID)?.window).toBe(200_000);
});

test('the last reply is found from the end of a large transcript, across multibyte text', () => {
  const file = join(tempDir(), 'long.jsonl');
  const reply = (at: string, tokens: number) =>
    JSON.stringify({
      type: 'assistant',
      timestamp: at,
      message: { model: 'claude-opus-5-5', usage: { input_tokens: tokens } },
    });
  // Lines longer than a read, of two-byte characters, so reads split lines and characters.
  const note = (n: number) =>
    JSON.stringify({ type: 'user', message: { content: `marée ${'é'.repeat(n)}` } });
  const lines = [
    reply('2026-09-25T10:00:00.000Z', 1000),
    note(100_001),
    reply('2026-09-25T10:00:09.000Z', 2000),
    note(70_000),
    note(3),
  ];
  writeFileSync(file, `${lines.join('\n')}\n`);
  expect(lastUsage(file)).toEqual({
    model: 'claude-opus-5-5',
    tokens: 2000,
    at: '2026-09-25T10:00:09.000Z',
  });
});
