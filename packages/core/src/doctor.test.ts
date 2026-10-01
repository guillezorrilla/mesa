import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { type Check, runDoctor } from './doctor.js';
import { CHECK_TIMEOUT_MS } from './lib/probe.js';
import { scriptedRunner, tempDir, testDeps } from './testing/index.js';
import type { ObsidianPaths } from './vault/obsidian.js';

const VERSIONS = {
  tmux: 'tmux 3.7c\n',
  claude: '2.1.282 (Claude Code)\n',
  codex: 'codex-cli 0.154.0\n',
  '/usr/libexec/PlistBuddy': '1.12.7\n',
};

const touch = (path: string) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, '');
};

/** A temp home with the Obsidian paths under it; `install` creates the ones named. */
function setup(install: (keyof ObsidianPaths)[] = []) {
  const home = tempDir();
  const { obsidian } = testDeps(home);
  for (const key of install) touch(obsidian[key]);
  return { home, obsidian };
}

const byName = (checks: Check[]) => Object.fromEntries(checks.map((c) => [c.name, c]));

test('found: versions parsed, registered obsidian, every probe bounded by the timeout, healthy', async () => {
  const { home, obsidian } = setup(['registered']);
  mkdirSync(join(home, 'profile'));
  const { run, calls } = scriptedRunner(VERSIONS);
  const report = await runDoctor({ run, obsidian, profileDir: join(home, 'profile') });
  const c = byName(report.checks);

  expect(report.healthy).toBe(true);
  expect(report.summary).toBe('ready');
  expect(c.tmux).toMatchObject({ ok: true, status: 'ok', version: '3.7c' });
  expect(c.claude).toMatchObject({ ok: true, status: 'ok', version: '2.1.282' });
  expect(c.codex).toMatchObject({ ok: true, version: '0.154.0' });
  expect(c.obsidian).toMatchObject({ ok: true, registered: true, version: '1.12.7' });
  expect(c['profile dir']).toMatchObject({ ok: true });
  expect(CHECK_TIMEOUT_MS).toBe(2000);
  expect(calls.every((x) => x.timeoutMs === CHECK_TIMEOUT_MS)).toBe(true);
});

test('missing: no tmux is unhealthy with a Homebrew hint; a bundle-only Obsidian is unregistered', async () => {
  const { home, obsidian } = setup(['bundle']);
  const { run } = scriptedRunner(VERSIONS, { missing: ['tmux', 'codex'] });
  const report = await runDoctor({ run, obsidian, profileDir: join(home, 'nope') });
  const c = byName(report.checks);

  expect(report.healthy).toBe(false);
  expect(report.summary).toBe(
    'tmux and at least one agent (claude or codex or antigravity) are required',
  );
  expect(c.tmux).toMatchObject({ ok: false, status: 'fail' });
  // One agent answered, so the missing one only warns.
  expect(c.codex).toMatchObject({ ok: false, status: 'warn' });
  expect(c.tmux?.hint).toContain('brew install tmux');
  expect(c.obsidian).toMatchObject({ ok: true, registered: false, path: obsidian.bundle });
  expect(c.obsidian?.hint).toContain('Command line interface');
  expect(c['profile dir']).toMatchObject({ ok: false, hint: 'does not exist yet' });
});

test('timeout: a hung agent is not ok, one agent is enough, and none is unhealthy', async () => {
  const { home, obsidian } = setup();
  const one = await runDoctor({
    run: scriptedRunner(VERSIONS, { slow: ['claude'] }).run,
    obsidian,
    profileDir: home,
  });
  expect(byName(one.checks).claude?.hint).toContain('did not answer within 2 s');
  expect(byName(one.checks).obsidian).toMatchObject({ ok: false, registered: false });
  expect(one.healthy).toBe(true);

  const none = await runDoctor({
    run: scriptedRunner(VERSIONS, { missing: ['codex', 'agy'], slow: ['claude'] }).run,
    obsidian,
    profileDir: home,
  });
  expect(none.healthy).toBe(false);
  // No agent answered: every agent row is a failure, so the labels match the verdict.
  expect(byName(none.checks).claude?.status).toBe('fail');
  expect(byName(none.checks).codex?.status).toBe('fail');
  expect(byName(none.checks).agy?.status).toBe('fail');
});

test("a Codex app-server daemon's socket is a warning, and no row while none runs", async () => {
  const { home, obsidian } = setup(['registered']);
  const { run } = scriptedRunner(VERSIONS);
  const socket = join(home, '.codex/app-server-control/app-server-control.sock');
  const doctor = () => runDoctor({ run, obsidian, profileDir: home, codexDaemon: socket });
  expect(byName((await doctor()).checks)['codex daemon']).toBeUndefined();
  touch(socket);
  const report = await doctor();
  expect(report.healthy).toBe(true);
  expect(byName(report.checks)['codex daemon']).toMatchObject({
    ok: false,
    status: 'warn',
    path: socket,
    hint: expect.stringContaining('Mesa keeps its codex windows off it'),
  });
});

test('an unlaid vault warns with what init would create; a laid-out one passes', async () => {
  const { home, obsidian } = setup(['registered']);
  mkdirSync(join(home, 'profile'));
  const { run } = scriptedRunner(VERSIONS);
  const vault = (missing: string[]) => () => ({ path: '/h/vault', ok: !missing.length, missing });
  const check = async (missing: string[]) =>
    byName(
      (await runDoctor({ run, obsidian, profileDir: join(home, 'profile'), vault: vault(missing) }))
        .checks,
    ).vault;
  expect(await check(['log.md', 'wiki'])).toMatchObject({
    ok: false,
    status: 'warn',
    path: '/h/vault',
    hint: 'missing log.md, wiki: run `mesa vault init`',
  });
  expect(await check([])).toMatchObject({ ok: true, status: 'ok' });
});
