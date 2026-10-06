import { expect, test } from 'vitest';
import { codexWorld, plantTranscript, tempDir } from '../../testing/index.js';
import { nativeName } from './native-name.js';

const ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const THREAD = '01a0e14e-be41-72f1-a81b-e25d2198602a';

/** A Claude Code transcript of `entries` after a line naming its folder; its native name. */
function claudeNamed(...entries: object[]) {
  const home = tempDir();
  const cwd = `${home}/src/lantern-cove`;
  const lines = [{ type: 'user', cwd }, ...entries].map((l) => JSON.stringify(l)).join('\n');
  plantTranscript(home, ID, cwd, lines);
  return nativeName({ home, env: {} }, { agent: 'claude', id: ID });
}

const custom = (customTitle: string) => ({ type: 'custom-title', customTitle });
const ai = (aiTitle: string) => ({ type: 'ai-title', aiTitle });

const KIB = 1 << 10;
const MIB = 1 << 20;
/** `bytes` of assistant message lines (rounded up), 1 KiB each with its newline. */
const messages = (bytes: number) =>
  Array.from({ length: Math.ceil(bytes / KIB) }, () => ({
    type: 'assistant',
    message: { role: 'assistant', content: 'Tide pump notes. '.repeat(57).slice(0, 959) },
  }));

test("a Claude Code name is the person's latest custom title, else the latest ai title", () => {
  expect(claudeNamed(custom('Tide tables'), ai('Harbor charts'))).toBe('Tide tables');
  expect(claudeNamed(custom('First'), custom('Second'))).toBe('Second');
  expect(claudeNamed(ai('First guess'), ai('Fix the tide pump'))).toBe('Fix the tide pump');
  expect(claudeNamed()).toBeUndefined();
});

test('a Claude Code name is read from the last 1 MiB of its transcript', () => {
  expect(claudeNamed(ai('Harbor charts'), ...messages(2 * MIB))).toBeUndefined();
  expect(
    claudeNamed(custom('Tide tables'), ...messages(2 * MIB), ai('Harbor charts'), ...messages(KIB)),
  ).toBe('Harbor charts');
  expect(
    claudeNamed(...messages(5 * MIB - 100 * KIB), custom('Tide tables'), ...messages(90 * KIB)),
  ).toBe('Tide tables');
});

test('a blank name is no name', () => {
  expect(claudeNamed(ai('Harbor charts'), custom('  '))).toBe('Harbor charts');
  expect(claudeNamed(ai(' '))).toBeUndefined();
});

test("a Codex thread's name is its last line in the session index; Antigravity has none", () => {
  const codex = codexWorld();
  const deps = { home: tempDir(), env: codex.env };
  expect(nativeName(deps, { agent: 'codex', id: THREAD })).toBeUndefined();
  codex.name(THREAD, 'Lantern wicks');
  codex.name('01a0e14e-be41-72f1-a81b-e25d2198602b', 'Other thread');
  codex.name(THREAD, 'Lantern lights');
  expect(nativeName(deps, { agent: 'codex', id: THREAD })).toBe('Lantern lights');
  expect(nativeName(deps, { agent: 'antigravity', id: THREAD })).toBeUndefined();
});
