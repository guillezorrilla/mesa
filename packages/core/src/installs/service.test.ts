import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { fakeHttp, fakeRelease, tempDir, testDeps } from '../testing/index.js';

const BROKER = 'https://broker.example.test';
const ID = '00000000-0000-4000-8000-000000000001';

/** A Mesa on `home` whose broker answers `status`, its clock at `now.at`, and the install file. */
function world(
  opts: {
    home?: string;
    status?: number;
    version?: string;
    dev?: boolean;
    env?: Record<string, string>;
  } = {},
) {
  const home = opts.home ?? tempDir();
  const web = fakeHttp({
    // The broker answers 204; a fake Response cannot carry a body with it, so 200 stands in.
    [`POST ${BROKER}/installs`]: { status: opts.status ?? 200, body: {} },
    [`DELETE ${BROKER}/installs/${ID}`]: { status: opts.status ?? 200, body: {} },
  });
  const now = { at: '2026-10-14T12:00:00.000Z' };
  const mesa = createMesa(
    'default',
    testDeps(home, {
      http: web.http,
      env: { MESA_BROKER_URL: BROKER, ...opts.env },
      clock: () => new Date(now.at),
      ...(opts.version ? { version: opts.version } : {}),
      ...(opts.dev ? {} : { release: fakeRelease() }),
    }),
  );
  const pings = () => web.requests.filter((r) => r.url.startsWith(`${BROKER}/installs`));
  const file = join(home, '.mesa', 'install.json');
  return { mesa, home, now, pings, file };
}

test('the first update check makes the install ID and sends it with the version and channel, once a day', async () => {
  const { mesa, now, pings, file } = world();
  await mesa.update.check();
  expect(pings().map((r) => [r.method, r.url, JSON.parse(r.body ?? '')])).toEqual([
    ['POST', `${BROKER}/installs`, { id: ID, version: '0.1.0-beta.4', channel: 'beta' }],
  ]);
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
    id: ID,
    enabled: true,
    sent: { at: '2026-10-14T12:00:00.000Z', version: '0.1.0-beta.4' },
  });
  now.at = '2026-10-15T11:59:00.000Z';
  await mesa.update.check();
  expect(pings()).toHaveLength(1);
  now.at = '2026-10-15T12:00:00.000Z';
  await mesa.update.check();
  expect(pings()).toHaveLength(2);
  expect(mesa.installs.status()).toEqual({ id: ID, enabled: true, lastSentAt: now.at });
});

test('an updated Mesa sends at once, with the same ID', async () => {
  const home = tempDir();
  await world({ home }).mesa.update.check();
  const updated = world({ home, version: '0.1.0-beta.5' });
  await updated.mesa.update.check();
  expect(updated.pings().map((r) => JSON.parse(r.body ?? ''))).toEqual([
    { id: ID, version: '0.1.0-beta.5', channel: 'beta' },
  ]);
});

test('a broker that fails never fails the update check, and the ping is tried again next time', async () => {
  const { mesa, pings } = world({ status: 500 });
  await expect(mesa.update.check()).resolves.toMatchObject({ current: '0.1.0-beta.4' });
  await mesa.update.check();
  expect(pings()).toHaveLength(2);
  expect(mesa.installs.status().lastSentAt).toBeNull();
});

test('off erases the install on the broker and stops the ping; on sends it again', async () => {
  const { mesa, pings } = world();
  await mesa.update.check();
  expect(await mesa.installs.set(false)).toEqual({
    id: ID,
    enabled: false,
    lastSentAt: null,
    erased: true,
  });
  expect(pings().at(-1)).toMatchObject({ method: 'DELETE', url: `${BROKER}/installs/${ID}` });
  await mesa.update.check();
  expect(pings()).toHaveLength(2);
  expect(await mesa.installs.set(true)).toEqual({ id: ID, enabled: true, lastSentAt: null });
  await mesa.update.check();
  expect(pings().map((r) => r.method)).toEqual(['POST', 'DELETE', 'POST']);
});

test('off before any ping makes the ID turned off, and says when the erase did not reach the broker', async () => {
  const { mesa, pings, file } = world({ status: 503 });
  expect(await mesa.installs.set(false)).toMatchObject({ enabled: false, erased: false });
  expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ id: ID, enabled: false });
  await mesa.update.check();
  expect(pings().map((r) => r.method)).toEqual(['DELETE']);
});

test.each([
  ['MESA_NO_INSTALL_PING=1', { env: { MESA_NO_INSTALL_PING: '1' } }],
  ['a development build', { dev: true }],
])('%s sends nothing and makes no ID', async (_, opts) => {
  const { mesa, pings, file } = world(opts);
  await mesa.update.check();
  expect(pings()).toEqual([]);
  expect(existsSync(file)).toBe(false);
  expect(mesa.installs.status()).toEqual({ id: null, enabled: true, lastSentAt: null });
});
