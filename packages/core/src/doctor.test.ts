import { expect, test } from 'vitest';
import {
  CHECK_TIMEOUT_MS,
  checkEnvironment,
  isHealthy,
  OBSIDIAN_BUNDLE,
  OBSIDIAN_REGISTERED,
  type Runner,
} from './doctor.js';

const OUTPUT: Record<string, string> = {
  tmux: 'tmux 3.7c\n',
  claude: '2.1.282 (Claude Code)\n',
  codex: 'codex-cli 0.154.0\n',
  '/usr/libexec/PlistBuddy': '1.12.7\n',
};

/** Answers from OUTPUT; names in `missing` are ENOENT, names in `slow` time out. */
function fakeRunner(missing: string[] = [], slow: string[] = []) {
  const calls: { file: string; timeoutMs: number }[] = [];
  const run: Runner = async (file, _args, timeoutMs) => {
    calls.push({ file, timeoutMs });
    if (missing.includes(file)) return { ok: false, reason: 'missing', detail: 'ENOENT' };
    if (slow.includes(file)) return { ok: false, reason: 'timeout', detail: 'killed' };
    return { ok: true, stdout: OUTPUT[file] ?? '' };
  };
  return { run, calls };
}

const byName = async (...args: Parameters<typeof checkEnvironment>) =>
  Object.fromEntries((await checkEnvironment(...args)).map((c) => [c.name, c]));

test('found: versions parsed, registered obsidian, healthy', async () => {
  const { run, calls } = fakeRunner();
  const exists = (p: string) => p === OBSIDIAN_REGISTERED || p === '/home/.mesa/default';
  const checks = await checkEnvironment({ profileDir: '/home/.mesa/default', run, exists });
  const c = Object.fromEntries(checks.map((x) => [x.name, x]));

  expect(c.tmux).toMatchObject({ required: true, ok: true, version: '3.7c' });
  expect(c.claude).toMatchObject({ ok: true, version: '2.1.282' });
  expect(c.codex).toMatchObject({ ok: true, version: '0.154.0' });
  expect(c.obsidian).toMatchObject({ ok: true, registered: true, version: '1.12.7' });
  expect(c['profile dir']).toMatchObject({ ok: true, path: '/home/.mesa/default' });
  expect(isHealthy(checks)).toBe(true);
  expect(CHECK_TIMEOUT_MS).toBe(2000);
  expect(calls.every((x) => x.timeoutMs === CHECK_TIMEOUT_MS)).toBe(true);
});

test('missing: tmux absent is unhealthy with a Homebrew hint; bundle-only obsidian is unregistered', async () => {
  const { run } = fakeRunner(['tmux', 'codex']);
  const exists = (p: string) => p === OBSIDIAN_BUNDLE;
  const checks = await checkEnvironment({ profileDir: '/nope', run, exists });
  const c = Object.fromEntries(checks.map((x) => [x.name, x]));

  expect(c.tmux).toMatchObject({ ok: false, required: true });
  expect(c.tmux?.hint).toContain('brew install tmux');
  expect(c.codex?.hint).toContain('brew install');
  expect(c.obsidian).toMatchObject({ ok: true, registered: false, path: OBSIDIAN_BUNDLE });
  expect(c.obsidian?.hint).toContain('Command line interface');
  expect(c['profile dir']?.ok).toBe(false);
  expect(isHealthy(checks)).toBe(false);
});

test('timeout: a hung agent is not ok, and one agent is enough', async () => {
  const { run } = fakeRunner([], ['claude']);
  const c = await byName({ profileDir: '/x', run, exists: () => false });

  expect(c.claude).toMatchObject({ ok: false });
  expect(c.claude?.hint).toContain('did not answer within 2 s');
  expect(c.obsidian).toMatchObject({ ok: false, registered: false });
  expect(isHealthy(Object.values(c))).toBe(true);

  const none = await checkEnvironment({
    profileDir: '/x',
    run: fakeRunner(['codex'], ['claude']).run,
  });
  expect(isHealthy(none)).toBe(false);
});
