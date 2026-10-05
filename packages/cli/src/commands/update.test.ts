import { fakeHttp, scriptedRunner } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const RELEASES = 'https://github.com/guillezorrilla/mesa/releases';
const BETA = `${RELEASES}/download/beta/latest.json`;
const STABLE = `${RELEASES}/latest/download/latest.json`;
const release = (version: string) => ({
  body: {
    version,
    platforms: {
      'darwin-aarch64': { signature: 'sig', url: 'https://example.test/Mesa.app.tar.gz' },
    },
  },
});

test('update check --json reports the newer beta to a beta, and the channel switch to stable', async () => {
  cli.deps = {
    http: fakeHttp({
      [`GET ${BETA}`]: release('0.1.0-beta.5'),
      [`GET ${STABLE}`]: release('0.0.9'),
      [`GET ${RELEASES}/download/beta/revoked.json`]: {
        body: {
          schemaVersion: 1,
          revokedVersions: [{ version: '0.1.0-beta.4', reason: 'Bad build' }],
        },
      },
    }).http,
  };
  await cli.mesa('init', '--vault', 'vault');
  expect((await cli.mesa('update', 'check', '--json')).json.data).toEqual({
    current: '0.1.0-beta.4',
    channel: 'beta',
    available: true,
    latest: '0.1.0-beta.5',
    feed: BETA,
    revoked: { version: '0.1.0-beta.4', reason: 'Bad build' },
    page: RELEASES,
  });
  expect((await cli.mesa('update', 'channel', 'stable', '--json')).json.data.channel).toBe(
    'stable',
  );
  expect((await cli.mesa('update', 'channel', '--json')).json.data).toEqual({ channel: 'stable' });
  // A stable older than the running beta is never offered.
  expect((await cli.mesa('update', 'check', '--json')).json.data).toMatchObject({
    channel: 'stable',
    available: false,
    latest: '0.0.9',
  });
  expect((await cli.mesa('update', 'revoked', '--json')).json.data).toEqual({
    version: '0.1.0-beta.4',
    reason: 'Bad build',
  });
  expect((await cli.mesa('update', 'channel', 'nightly')).code).toBe(2);
});

test('update install from a mesa outside an installed app says where to download', async () => {
  cli.deps = { http: fakeHttp({ [`GET ${BETA}`]: release('0.1.0-beta.5') }).http };
  const out = await cli.mesa('update', 'install', '--json');
  expect(out.json.error.message).toMatch(/not part of an installed Mesa.app.*releases/);
});

test('update install hands the newer version to the installed app, which starts if closed', async () => {
  const app = '/Applications/Mesa.app';
  const runner = scriptedRunner();
  cli.run = runner.run;
  cli.deps = {
    http: fakeHttp({ [`GET ${BETA}`]: release('0.1.0-beta.5') }).http,
    self: [`${app}/Contents/MacOS/mesa`],
  };
  const out = await cli.mesa('update', 'install');
  expect(out.stdout).toContain('Mesa 0.1.0-beta.5 is available.');
  expect(out.stdout).toContain('choose Install there');
  expect(runner.calls.map((c) => [c.file, ...c.args])).toEqual([
    ['/usr/bin/open', '-a', app, 'mesa://update/install'],
  ]);
});
