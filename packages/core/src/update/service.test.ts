import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import { execRunner, type Runner } from '../lib/process.js';
import { profileService } from '../profile/service.js';
import { fakeHttp, minisignKey, tempDir, testDeps } from '../testing/index.js';
import { FEEDS, REVOKED_LIST, UPDATE_LINK } from './feeds.js';
import { UPDATE_PUBLIC_KEY } from './minisign.js';
import { updateService } from './service.js';

const [BETA, STABLE] = FEEDS.beta as [string, string];
const ARCHIVE = 'https://downloads.example.test/Mesa.app.tar.gz';

const manifest = (version: string, signature = 'unsigned') => ({
  body: {
    version,
    notes: `https://github.com/guillezorrilla/mesa/releases/tag/v${version}`,
    platforms: {
      'darwin-aarch64': { signature, url: ARCHIVE },
      'darwin-x86_64': { signature, url: ARCHIVE },
    },
  },
});

/** The update service over a fake web; the running version is testDeps' 0.1.0-beta.4. */
function world(
  routes: Parameters<typeof fakeHttp>[0],
  deps: Parameters<typeof testDeps>[1] = {},
  publicKey?: string,
) {
  const web = fakeHttp(routes);
  const ctx = createContext('default', testDeps(tempDir(), { http: web.http, ...deps }));
  return { web, update: updateService(ctx, profileService(ctx).config, publicKey) };
}

test('a beta follows the beta feed and is offered a newer beta, from that feed', async () => {
  const { update } = world({ [`GET ${BETA}`]: manifest('0.1.0-beta.5') });
  expect(await update.check()).toEqual({
    current: '0.1.0-beta.4',
    channel: 'beta',
    available: true,
    latest: '0.1.0-beta.5',
    feed: BETA,
    notes: 'https://github.com/guillezorrilla/mesa/releases/tag/v0.1.0-beta.5',
    page: 'https://github.com/guillezorrilla/mesa/releases',
  });
});

test('beta also offers a stable newer than the newest beta', async () => {
  const { update } = world({
    [`GET ${BETA}`]: manifest('0.1.0-beta.5'),
    [`GET ${STABLE}`]: manifest('0.1.0'),
  });
  expect(await update.check()).toMatchObject({ available: true, latest: '0.1.0', feed: STABLE });
});

test('the same version, an older one, or no release at all is never offered', async () => {
  for (const routes of [
    { [`GET ${BETA}`]: manifest('0.1.0-beta.4') },
    { [`GET ${BETA}`]: manifest('0.1.0-beta.3'), [`GET ${STABLE}`]: manifest('0.0.9') },
    {},
  ]) {
    const found = await world(routes).update.check();
    expect(found.available).toBe(false);
  }
  // beta.10 is newer than beta.4: prerelease numbers compare as numbers.
  expect(
    (await world({ [`GET ${BETA}`]: manifest('0.1.0-beta.10') }).update.check()).available,
  ).toBe(true);
});

test('a feed that fails, other than with no release yet, is an error', async () => {
  const { update } = world({ [`GET ${BETA}`]: { status: 503, body: {} } });
  await expect(update.check()).rejects.toThrow(/HTTP 503/);
});

test('the running version is revoked by version or by range; a failed read never blocks', async () => {
  const revoked = (version: string) => ({
    [`GET ${REVOKED_LIST}`]: {
      body: { schemaVersion: 1, revokedVersions: [{ version, reason: 'Loses session logs' }] },
    },
  });
  expect(await world(revoked('0.1.0-beta.4')).update.revoked()).toEqual({
    version: '0.1.0-beta.4',
    reason: 'Loses session logs',
  });
  expect(await world(revoked('>=0.1.0-beta.2 <0.1.0-beta.5')).update.revoked()).toMatchObject({
    reason: 'Loses session logs',
  });
  expect(await world(revoked('0.1.0-beta.3')).update.revoked()).toBeUndefined();
  expect(await world({}).update.revoked()).toBeUndefined();
  expect(
    await world({ [`GET ${REVOKED_LIST}`]: { body: { nope: true } } }).update.revoked(),
  ).toBeUndefined();
  const both = await world({
    ...revoked('0.1.0-beta.4'),
    [`GET ${BETA}`]: manifest('0.1.0-beta.5'),
  }).update.check();
  expect(both).toMatchObject({ available: true, revoked: { reason: 'Loses session logs' } });
});

test('the CLI key is the one the app verifies updates with', () => {
  const conf = JSON.parse(
    readFileSync(
      new URL('../../../../apps/desktop/src-tauri/tauri.conf.json', import.meta.url),
      'utf8',
    ),
  );
  expect(conf.plugins.updater.pubkey).toBe(UPDATE_PUBLIC_KEY);
});

/** An installed /Applications/Mesa.app at `version`, and a signed archive of the next one. */
function installed(version: string) {
  const root = tempDir();
  const app = join(root, 'Applications/Mesa.app');
  mkdirSync(join(app, 'Contents/MacOS'), { recursive: true });
  writeFileSync(join(app, 'Contents/version'), version);
  const staged = join(root, 'staged');
  mkdirSync(join(staged, 'Mesa.app/Contents/MacOS'), { recursive: true });
  writeFileSync(join(staged, 'Mesa.app/Contents/version'), '0.1.0-beta.5');
  execFileSync('tar', ['-czf', join(root, 'next.tar.gz'), '-C', staged, 'Mesa.app']);
  return {
    app,
    self: [join(app, 'Contents/MacOS/mesa')],
    archive: new Uint8Array(readFileSync(join(root, 'next.tar.gz'))),
    version: () => readFileSync(join(app, 'Contents/version'), 'utf8'),
  };
}

/** Real tar; pgrep finds the app running or not; open is recorded. */
function machine(appRunning: boolean) {
  const opened: string[] = [];
  const run: Runner = async (file, args, timeoutMs, options) => {
    if (file === '/usr/bin/pgrep')
      return appRunning
        ? { ok: true, stdout: '4242\n' }
        : { ok: false, reason: 'failed', detail: '' };
    if (file === '/usr/bin/open') {
      opened.push(...args);
      return { ok: true, stdout: '' };
    }
    return execRunner(file, args, timeoutMs, options);
  };
  return { run, opened };
}

test('install verifies the archive and replaces the closed app with the new version', async () => {
  const key = minisignKey();
  const mac = installed('0.1.0-beta.4');
  const { run, opened } = machine(false);
  const { update } = world(
    {
      [`GET ${BETA}`]: manifest('0.1.0-beta.5', key.sign(mac.archive)),
      [`GET ${ARCHIVE}`]: { bytes: mac.archive },
    },
    { self: mac.self, run },
    key.publicKey,
  );
  expect(await update.install()).toMatchObject({ outcome: 'replaced', app: mac.app });
  expect(mac.version()).toBe('0.1.0-beta.5');
  expect(opened).toEqual([]);
});

test('install hands a running app the update through its link', async () => {
  const key = minisignKey();
  const mac = installed('0.1.0-beta.4');
  const { run, opened } = machine(true);
  const { update } = world(
    {
      [`GET ${BETA}`]: manifest('0.1.0-beta.5', key.sign(mac.archive)),
      [`GET ${ARCHIVE}`]: { bytes: mac.archive },
    },
    { self: mac.self, run },
    key.publicKey,
  );
  expect(await update.install()).toMatchObject({ outcome: 'handed-to-app' });
  expect(opened).toEqual([UPDATE_LINK]);
  expect(mac.version()).toBe('0.1.0-beta.4');
});

test('an archive signed with another key, or changed after signing, is refused and nothing changes', async () => {
  const mac = installed('0.1.0-beta.4');
  const { run } = machine(false);
  const tampered = mac.archive.slice();
  tampered[100] = (tampered[100] ?? 0) ^ 1;
  const ours = minisignKey();
  for (const [signature, bytes, why] of [
    [
      minisignKey(Buffer.from('fedcba9876543210', 'hex')).sign(mac.archive),
      mac.archive,
      /another key/,
    ],
    [minisignKey().sign(mac.archive), mac.archive, /not the one that was signed/],
    [ours.sign(mac.archive), tampered, /not the one that was signed/],
  ] as const) {
    const { update } = world(
      { [`GET ${BETA}`]: manifest('0.1.0-beta.5', signature), [`GET ${ARCHIVE}`]: { bytes } },
      { self: mac.self, run },
      ours.publicKey,
    );
    await expect(update.install()).rejects.toThrow(why);
    expect(mac.version()).toBe('0.1.0-beta.4');
  }
});

test('install refuses a mesa outside an installed app, and does nothing when up to date', async () => {
  const dev = world({ [`GET ${BETA}`]: manifest('0.1.0-beta.5') });
  await expect(dev.update.install()).rejects.toThrow(/not part of an installed Mesa.app/);
  const dmg = world(
    { [`GET ${BETA}`]: manifest('0.1.0-beta.5') },
    { self: ['/Volumes/Mesa/Mesa.app/Contents/MacOS/mesa'] },
  );
  await expect(dmg.update.install()).rejects.toThrow(/not part of an installed Mesa.app/);
  const current = world({ [`GET ${BETA}`]: manifest('0.1.0-beta.4') });
  expect(await current.update.install()).toMatchObject({ outcome: 'up-to-date' });
  expect(current.web.requests.map((r) => r.url)).not.toContain(ARCHIVE);
});
