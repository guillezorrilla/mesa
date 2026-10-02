import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import {
  atlassianWorld,
  fakeSignIn,
  fixedClock,
  TEST_BROKER,
  tempDir,
  testDeps,
} from '../testing/index.js';

const ITEM = 'mesa.default.sources atlassian';
const ACCOUNT = { id: 'acc-1', name: 'Rowan Tide', email: 'rowan@example.test' };
const SITES = [{ id: 'cloud-1', name: 'lantern-cove', url: 'https://lantern-cove.atlassian.net' }];

/** A profile with a vault over `world`, at the fixed clock's 12:00. */
function setUp(world = atlassianWorld()) {
  const home = tempDir();
  const mesa = createMesa('default', testDeps(home, world.deps));
  mesa.init({ vault: 'vault' });
  mesa.vault.init();
  return { world, home, mesa, vault: join(home, 'vault') };
}

/** The connection the Keychain holds, parsed. */
const stored = (world: ReturnType<typeof atlassianWorld>) =>
  JSON.parse(world.secrets.items.get(ITEM) ?? 'null');

/** Every file's text under `dir`. */
const texts = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => readFileSync(join(entry.parentPath, entry.name), 'utf8'));

test('connect signs in through the broker, stores the tokens and sites in the Keychain, and lists the account live', async () => {
  const { world, mesa, vault } = setUp();
  const connected = await mesa.sources.connect('atlassian');
  expect(connected.result).toEqual({
    id: 'atlassian',
    label: 'Atlassian',
    connected: true,
    status: 'connected',
    account: ACCOUNT,
    sites: SITES,
  });
  const [opened] = world.signIn.opened;
  const state = new URL(opened ?? '').searchParams.get('state');
  expect(opened).toBe(
    `${TEST_BROKER}/authorize/atlassian?state=${encodeURIComponent(state ?? '')}`,
  );
  expect(state).toMatch(/^01TEST\d{20}\.49152$/);
  expect(world.signIn.closed).toBe(1);
  expect(world.requests.find((r) => r.method === 'POST')).toMatchObject({
    url: `${TEST_BROKER}/token/atlassian`,
    body: JSON.stringify({ grant_type: 'authorization_code', code: 'code-1' }),
  });
  expect(stored(world)).toEqual({
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    expiresAt: '2026-09-24T13:00:00.000Z',
    sites: SITES,
    status: 'connected',
  });
  expect(listReceipts(vault, 10, { kind: 'connection' })[0]).toMatchObject({
    summary: 'Connected Atlassian',
    receipt: {
      kind: 'connection',
      status: 'ok',
      inputs: { source: 'atlassian' },
      outputs: { source: 'atlassian', sites: ['lantern-cove'] },
    },
  });
  expect(await mesa.sources.list()).toEqual({ sources: [connected.result] });
});

test('no token, and nothing about the person, reaches argv, the profile, the vault, or receipts', async () => {
  const { world, home, mesa } = setUp();
  await mesa.sources.connect('atlassian');
  await mesa.sources.list();
  await mesa.sources.disconnect('atlassian');
  const everything = [...texts(home), ...world.calls.map((c) => [c.file, ...c.args].join(' '))];
  expect(everything.length).toBeGreaterThan(3);
  for (const secret of ['access-1', 'refresh-1', 'code-1', 'Rowan', 'rowan@', 'acc-1'])
    expect(everything.filter((text) => text.includes(secret))).toEqual([]);
});

test('the Keychain item holds no account, only tokens, expiry, status, and sites', async () => {
  const { world, mesa } = setUp();
  await mesa.sources.connect('atlassian');
  const item = world.secrets.items.get(ITEM) ?? '';
  for (const personal of ['Rowan', 'rowan@', 'acc-1']) expect(item).not.toContain(personal);
});

test.each([
  [
    'a state from another request',
    () => ({ code: 'code-1', state: 'forged.49152' }),
    /another request/,
  ],
  ['denied consent', (state: string) => ({ error: 'access_denied', state }), /access_denied/],
  ['no code', (state: string) => ({ state }), /no code/],
])('a sign-in with %s stores nothing and exchanges no code', async (_, answer, message) => {
  const world = atlassianWorld(fakeSignIn(answer));
  const { mesa, vault } = setUp(world);
  await expect(mesa.sources.connect('atlassian')).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringMatching(message),
  });
  expect(world.secrets.items.size).toBe(0);
  expect(world.requests).toEqual([]);
  expect(world.signIn.closed).toBe(1);
  expect(listReceipts(vault, 10, { kind: 'connection' })).toEqual([]);
});

test('an expired access token refreshes through the broker, and the rotated refresh token is stored', async () => {
  const world = atlassianWorld();
  const { home, mesa } = setUp(world);
  await mesa.sources.connect('atlassian');
  // Two hours on: access-1 expired at 13:00.
  const later = createMesa(
    'default',
    testDeps(home, { ...world.deps, clock: fixedClock('2026-09-24T14:00:00.000Z') }),
  );
  const get = later.sources.fetch('atlassian');
  const [a, b] = await Promise.all([
    get('https://api.atlassian.com/me'),
    get('https://api.atlassian.com/me'),
  ]);
  expect([a.status, b.status]).toEqual([200, 200]);
  const refreshes = world.requests.filter((r) => r.body?.includes('refresh_token'));
  expect(refreshes.map((r) => JSON.parse(r.body ?? ''))).toEqual([
    { grant_type: 'refresh_token', refresh_token: 'refresh-1' },
  ]);
  expect(world.requests.at(-1)?.headers.authorization).toBe('Bearer access-2');
  expect(stored(world)).toMatchObject({
    accessToken: 'access-2',
    refreshToken: 'refresh-2',
    expiresAt: '2026-09-24T15:00:00.000Z',
    status: 'connected',
  });
});

test('a 401 on a token not yet expired refreshes once and retries', async () => {
  const { world, mesa } = setUp();
  await mesa.sources.connect('atlassian');
  world.expire();
  const response = await mesa.sources.fetch('atlassian')('https://api.atlassian.com/me');
  expect(await response.json()).toMatchObject({ account_id: 'acc-1' });
  expect(stored(world)).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
});

test('a revoked connection becomes needs-reconnect: calls refuse, list keeps the sites without the account', async () => {
  const { world, mesa } = setUp();
  await mesa.sources.connect('atlassian');
  world.revoke();
  await expect(
    mesa.sources.fetch('atlassian')('https://api.atlassian.com/me'),
  ).rejects.toMatchObject({
    code: 'invalid_config',
    message: 'Atlassian needs reconnecting: run mesa sources connect atlassian',
  });
  expect(stored(world)).toMatchObject({ status: 'needs-reconnect', refreshToken: 'refresh-1' });
  const before = world.requests.length;
  expect(await mesa.sources.list()).toEqual({
    sources: [
      {
        id: 'atlassian',
        label: 'Atlassian',
        connected: true,
        status: 'needs-reconnect',
        sites: SITES,
      },
    ],
  });
  // A connection known to need reconnecting is not tried again.
  expect(world.requests.length).toBe(before);
  // Reconnecting signs in afresh.
  expect((await mesa.sources.connect('atlassian')).result.status).toBe('connected');
});

test('list finds a revoked token on its live account read and says so', async () => {
  const { world, mesa } = setUp();
  await mesa.sources.connect('atlassian');
  world.revoke();
  expect((await mesa.sources.list()).sources[0]).toEqual({
    id: 'atlassian',
    label: 'Atlassian',
    connected: true,
    status: 'needs-reconnect',
    sites: SITES,
  });
});

test('disconnect removes the Keychain item and leaves a receipt; again, it changes nothing', async () => {
  const { world, mesa, vault } = setUp();
  await mesa.sources.connect('atlassian');
  const gone = await mesa.sources.disconnect('atlassian');
  expect(gone.result).toEqual({ source: 'atlassian', removed: true });
  expect(gone.receipt).not.toBeNull();
  expect(world.secrets.items.size).toBe(0);
  expect(listReceipts(vault, 10, { kind: 'connection' })[0]).toMatchObject({
    summary: 'Disconnected Atlassian',
    receipt: { outputs: { source: 'atlassian' } },
  });
  const again = await mesa.sources.disconnect('atlassian');
  expect(again).toMatchObject({ result: { removed: false }, receipt: null });
  expect((await mesa.sources.list()).sources).toEqual([
    { id: 'atlassian', label: 'Atlassian', connected: false, status: 'disconnected' },
  ]);
  await expect(
    mesa.sources.fetch('atlassian')('https://api.atlassian.com/me'),
  ).rejects.toMatchObject({ code: 'not_found' });
});

test('an unknown source is a usage error', async () => {
  const { mesa } = setUp();
  await expect(async () => mesa.sources.connect('linear')).rejects.toMatchObject({
    code: 'usage',
    message: 'unknown source linear; one of atlassian',
  });
  await expect(async () => mesa.sources.disconnect('toString')).rejects.toMatchObject({
    code: 'usage',
  });
});

test('connections are per profile', async () => {
  const world = atlassianWorld();
  const { home, mesa } = setUp(world);
  await mesa.sources.connect('atlassian');
  const other = createMesa('work', testDeps(home, world.deps));
  other.init({ vault: 'vault-work' });
  expect((await other.sources.list()).sources[0]?.status).toBe('disconnected');
  expect([...world.secrets.items.keys()]).toEqual([ITEM]);
});
