import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  fakePairingBroker,
  fakePhone,
  memorySecretStore,
  projectProfile,
  scriptedRunner,
} from '../testing/index.js';
import { macPairingStore } from './mac-pairing.js';
import { sendToPhone, takeFromPhone } from './mailbox.js';
import { newKeyPair } from './protocol/seal.js';

const NOW = new Date('2026-09-24T12:00:00.000Z');

/** A profile whose broker is a fake one, its Keychain in memory, and a phone on the same broker. */
function setup() {
  const broker = fakePairingBroker('https://broker.test', () => NOW);
  const secrets = memorySecretStore();
  const { mesa, home } = projectProfile(scriptedRunner().run, {
    http: broker.http,
    secretStore: secrets.store,
    env: { MESA_BROKER_URL: 'https://broker.test/' },
  });
  return { mesa, home, broker, secrets, phone: fakePhone(broker.http, () => NOW) };
}

/** Every file under `dir`, as text. */
const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [readFileSync(path, 'utf8')];
  });

test('pair shows a QR link and keeps the Mac half in the Keychain only; the phone joins and status confirms it', async () => {
  const { mesa, home, broker, secrets, phone } = setup();
  const started = (await mesa.phone.pair()).result;
  expect(started).toMatchObject({
    pairingId: 'pairing-0000000001',
    qr: expect.stringMatching(
      /^mesa:\/\/pair\?v=1&b=https%3A%2F%2Fbroker\.test&p=pairing-0000000001&s=/,
    ),
    expiresAt: '2026-09-24T12:10:00.000Z',
    svg: expect.stringContaining('<svg'),
    text: expect.any(String),
  });
  expect(await mesa.phone.status()).toEqual({
    paired: false,
    pending: true,
    pairingId: 'pairing-0000000001',
    expiresAt: '2026-09-24T12:10:00.000Z',
  });

  await phone.join(started.qr);
  expect(await mesa.phone.status()).toEqual({
    paired: true,
    pairingId: 'pairing-0000000001',
    since: NOW.toISOString(),
    phoneLastSeen: NOW.toISOString(),
  });

  const item = JSON.parse(secrets.items.get(`mesa.${'default'}.phone pairing`) ?? '{}');
  expect(item).toMatchObject({ pairingId: 'pairing-0000000001', phoneKey: expect.any(String) });
  expect(item).not.toHaveProperty('secret');
  const onDisk = filesUnder(home).join('\n');
  expect(onDisk).not.toContain(item.privateKey);
  expect(onDisk).not.toContain(item.macToken);
  expect(broker.rooms.get('pairing-0000000001')?.boxes).toEqual([]);
});

test('a phone that joins without the secret in its hello is never trusted', async () => {
  const { mesa, broker } = setup();
  const started = (await mesa.phone.pair()).result;
  const room = broker.rooms.get(started.pairingId);
  if (!room) throw new Error('no room');
  // The broker, or anyone holding the hash, joins with a key of its own but cannot seal the secret.
  Object.assign(room, { joinedAt: NOW.toISOString(), phoneKey: newKeyPair().publicKey });
  room.boxes.push({ id: 99, box: 'AAAA'.repeat(10), at: NOW.toISOString(), to: 'mac' });
  expect(await mesa.phone.status()).toMatchObject({ paired: false, pending: true });
});

test('a sealed message crosses both ways, and each side takes it once', async () => {
  const { mesa, phone } = setup();
  await phone.join((await mesa.phone.pair()).result.qr);
  await mesa.phone.status();
  const deps = mesa.phone.deps;

  await sendToPhone(deps, { kind: 'text', text: 'Session needs you' });
  expect(await phone.take()).toEqual([{ kind: 'text', text: 'Session needs you' }]);
  expect(await phone.take()).toEqual([]);

  await phone.send({ kind: 'text', text: 'on my way' });
  expect((await takeFromPhone(deps)).map((o) => o.message)).toEqual([
    { kind: 'text', text: 'on my way' },
  ]);
  expect(await takeFromPhone(deps)).toEqual([]);
});

test('a second pair while paired is refused; while pending it replaces the QR', async () => {
  const { mesa, phone, broker } = setup();
  const first = (await mesa.phone.pair()).result;
  const second = (await mesa.phone.pair()).result;
  expect(second.pairingId).not.toBe(first.pairingId);
  expect(broker.rooms.has(first.pairingId)).toBe(false);
  await phone.join(second.qr);
  await mesa.phone.status();
  await expect(mesa.phone.pair()).rejects.toThrow(/paired with a phone .* mesa phone unpair first/);
});

test('unpair ends it on the broker and here, and a pairing the broker forgot reads as unpaired', async () => {
  const { mesa, phone, broker, secrets } = setup();
  await phone.join((await mesa.phone.pair()).result.qr);
  await mesa.phone.status();
  expect((await mesa.phone.unpair()).result).toEqual({
    unpaired: true,
    pairingId: 'pairing-0000000001',
    brokerRemoved: true,
  });
  expect(broker.rooms.size).toBe(0);
  expect(secrets.items.size).toBe(0);
  expect((await mesa.phone.unpair()).result).toEqual({ unpaired: false });

  (await mesa.phone.pair()).result;
  broker.rooms.clear();
  expect(await mesa.phone.status()).toEqual({ paired: false });
  expect(await macPairingStore(secrets.store, 'default').read()).toBeUndefined();
});

test('a broker that cannot be reached says so when pairing', async () => {
  const { mesa } = setup();
  const offline = projectProfile(scriptedRunner().run, {
    http: async () => {
      throw new Error('offline');
    },
    env: { MESA_BROKER_URL: 'https://broker.test' },
  });
  await expect(offline.mesa.phone.pair()).rejects.toThrow(
    "couldn't reach the broker at https://broker.test",
  );
  expect(await mesa.phone.status()).toEqual({ paired: false });
});
