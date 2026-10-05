import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import { profileService } from '../profile/service.js';
import { fakeHttp, scriptedRunner, tempDir, testDeps } from '../testing/index.js';
import { FEEDS, REVOKED_LIST, UPDATE_LINK } from './feeds.js';
import { updateService } from './service.js';

const [BETA, STABLE] = FEEDS.beta as [string, string];
const ARCHIVE = 'https://downloads.example.test/Mesa.app.tar.gz';

const manifest = (version: string, signature = 'sig') => ({
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
function world(routes: Parameters<typeof fakeHttp>[0], deps: Parameters<typeof testDeps>[1] = {}) {
  const web = fakeHttp(routes);
  const ctx = createContext('default', testDeps(tempDir(), { http: web.http, ...deps }));
  return { web, update: updateService(ctx, profileService(ctx).config) };
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

const APP = '/Applications/Mesa.app';
const SELF = [`${APP}/Contents/MacOS/mesa`];

/** Every command it runs, with `open` failing when asked. */
function machine(openFails = false) {
  const { run, calls } = scriptedRunner({}, openFails ? { failing: ['/usr/bin/open'] } : {});
  return { run, ran: () => calls.map((c) => [c.file, ...c.args]) };
}

test('install hands a newer version to the installed app through its link, open or closed', async () => {
  const { run, ran } = machine();
  const { web, update } = world({ [`GET ${BETA}`]: manifest('0.1.0-beta.5') }, { self: SELF, run });
  expect(await update.install()).toMatchObject({
    outcome: 'handed-to-app',
    latest: '0.1.0-beta.5',
    app: APP,
  });
  // `open -a` starts the app when it is closed, and reaches this app, not another copy.
  expect(ran()).toEqual([['/usr/bin/open', '-a', APP, UPDATE_LINK]]);
  // The app downloads and verifies; the CLI never fetches the archive.
  expect(web.requests.map((r) => r.url)).not.toContain(ARCHIVE);
});

test('install says so when the app cannot be opened', async () => {
  const { run } = machine(true);
  const { update } = world({ [`GET ${BETA}`]: manifest('0.1.0-beta.5') }, { self: SELF, run });
  await expect(update.install()).rejects.toThrow(/Cannot open \/Applications\/Mesa.app/);
});

test('install refuses a mesa outside an installed app, and opens nothing when up to date', async () => {
  for (const self of [undefined, ['/Volumes/Mesa/Mesa.app/Contents/MacOS/mesa']]) {
    const { run, ran } = machine();
    const outside = world(
      { [`GET ${BETA}`]: manifest('0.1.0-beta.5') },
      { run, ...(self ? { self } : {}) },
    );
    await expect(outside.update.install()).rejects.toThrow(
      /not part of an installed Mesa.app.*github.com\/guillezorrilla\/mesa\/releases/,
    );
    expect(ran()).toEqual([]);
  }
  const { run, ran } = machine();
  const current = world({ [`GET ${BETA}`]: manifest('0.1.0-beta.4') }, { self: SELF, run });
  expect(await current.update.install()).toMatchObject({
    outcome: 'up-to-date',
    page: 'https://github.com/guillezorrilla/mesa/releases',
  });
  expect(ran()).toEqual([]);
});
