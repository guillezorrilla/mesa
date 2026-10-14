import { describe, expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { prCli, prRemote, resolveRemote } from './provider.js';

describe('prRemote provider', () => {
  test.each([
    ['https://github.com/acme/web.git', 'github'],
    ['git@github.com:acme/web.git', 'github'],
    ['ssh://git@github.com/acme/web', 'github'],
    ['https://bitbucket.org/acme/web.git', 'bitbucket'],
    ['git@bitbucket.org:acme/web.git', 'bitbucket'],
    ['https://ana@bitbucket.org/acme/web.git\n', 'bitbucket'],
  ])('%s is on %s', (url, provider) => {
    expect(prRemote(url)?.provider).toBe(provider);
  });

  test.each([
    'https://gitlab.com/acme/web.git',
    'https://github.com.example.net/acme/web.git',
    'git@bitbucket.example.com:acme/web.git',
    '/Users/ana/src/web',
    '',
  ])('%s has no PR provider', (url) => {
    expect(prRemote(url)?.provider).toBeUndefined();
  });
});

test('prRemote names the repo', () => {
  expect(prRemote('git@github.com:acme/web.git')).toEqual({ provider: 'github', repo: 'acme/web' });
  expect(prRemote('https://bitbucket.org/acme-eng/pos.bridge/')).toEqual({
    provider: 'bitbucket',
    repo: 'acme-eng/pos.bridge',
  });
});

test('resolveRemote follows an ssh host alias to its real host, and asks ssh only for one', async () => {
  const { run, calls } = scriptedRunner({
    ssh: (args) =>
      args[2] === 'github.com-work'
        ? 'user git\nhostname github.com\nport 22\n'
        : 'hostname gitlab.example.com\n',
  });
  expect(await resolveRemote(run, 'git@github.com-work:acme/web.git')).toEqual({
    provider: 'github',
    repo: 'acme/web',
  });
  expect(await resolveRemote(run, 'git@code-mirror:acme/web.git')).toBeUndefined();
  expect(await resolveRemote(run, 'https://bitbucket.org/acme-eng/web.git')).toEqual({
    provider: 'bitbucket',
    repo: 'acme-eng/web',
  });
  expect(await resolveRemote(run, 'https://gitlab.com/acme/web.git')).toBeUndefined();
  expect(calls.map((c) => c.args)).toEqual([
    ['-G', '--', 'github.com-work'],
    ['-G', '--', 'code-mirror'],
  ]);
});

describe('prCli', () => {
  test('gh is ready when its version and auth status answer', async () => {
    const { run, calls } = scriptedRunner({ gh: 'gh version 2.62.0 (2026-01-01)\n' });
    expect(await prCli(run, 'github')).toEqual({
      state: 'ready',
      version: 'gh version 2.62.0 (2026-01-01)',
    });
    expect(calls.map((c) => [c.file, ...c.args])).toEqual([
      ['gh', '--version'],
      ['gh', 'auth', 'status'],
    ]);
  });

  test('twg is unauthenticated when whoami fails', async () => {
    const { run, calls } = scriptedRunner({
      twg: (args) =>
        args[0] === 'whoami' ? { ok: false, reason: 'failed', detail: 'exit 1' } : '1.3.5\n',
    });
    expect(await prCli(run, 'bitbucket')).toEqual({ state: 'unauthenticated', version: '1.3.5' });
    expect(calls.map((c) => [c.file, ...c.args])).toEqual([
      ['twg', '--version'],
      ['twg', 'whoami'],
    ]);
  });

  test('a CLI off PATH is missing', async () => {
    const { run } = scriptedRunner({}, { missing: ['twg'] });
    expect(await prCli(run, 'bitbucket')).toEqual({ state: 'missing' });
  });

  test('a CLI that hangs is unavailable', async () => {
    const { run } = scriptedRunner({}, { slow: ['gh'] });
    expect(await prCli(run, 'github')).toEqual({ state: 'unavailable', reason: 'timeout' });
  });
});
