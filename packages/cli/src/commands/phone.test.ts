import { fakePairingBroker, fakePhone, memorySecretStore } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const BROKER = 'https://broker.test';

test('phone pair prints the QR link as JSON and draws it; the phone joins; status and unpair follow', async () => {
  const broker = fakePairingBroker(BROKER);
  cli.deps = {
    http: broker.http,
    secretStore: memorySecretStore().store,
    env: { MESA_BROKER_URL: BROKER },
  };
  await cli.withProject();
  const paired = await cli.mesa('phone', 'pair', '--json');
  expect(paired.code).toBe(0);
  expect(paired.json.data).toEqual({
    pairingId: 'pairing-0000000001',
    qr: expect.stringMatching(/^mesa:\/\/pair\?v=1&/),
    expiresAt: expect.any(String),
    svg: expect.stringContaining('<svg'),
    receipt: { id: expect.any(String), path: expect.stringMatching(/^receipts\//) },
  });
  expect((await cli.mesa('phone', 'status', '--json')).json.data).toMatchObject({
    paired: false,
    pending: true,
  });

  await fakePhone(broker.http).join(paired.json.data.qr);
  const status = await cli.mesa('phone', 'status');
  expect(status.stdout).toMatch(/^paired pairing-0000000001 since /);
  expect((await cli.mesa('phone', 'status', '--json')).json.data).toMatchObject({
    paired: true,
    pairingId: 'pairing-0000000001',
  });

  const unpaired = await cli.mesa('phone', 'unpair', '--json');
  expect(unpaired.json.data).toEqual({
    unpaired: true,
    pairingId: 'pairing-0000000001',
    brokerRemoved: true,
    receipt: { id: expect.any(String), path: expect.stringMatching(/^receipts\//) },
  });
  expect((await cli.mesa('phone', 'status')).stdout).toBe('not paired\n');
});

test('phone pair in a terminal draws the QR in block characters and says what to do next', async () => {
  cli.deps = { http: fakePairingBroker(BROKER).http, env: { MESA_BROKER_URL: BROKER } };
  await cli.withProject();
  const out = await cli.mesa('phone', 'pair');
  expect(out.code).toBe(0);
  expect(out.stdout).toMatch(/[▀▄█]/);
  expect(out.stdout).toContain('Scan it with the Mesa app on your phone before');
});

test('phone pair with no broker reachable fails and keeps nothing', async () => {
  cli.deps = {
    http: async () => {
      throw new Error('offline');
    },
    env: { MESA_BROKER_URL: BROKER },
  };
  await cli.withProject();
  const out = await cli.mesa('phone', 'pair');
  expect(out.code).toBe(1);
  expect(out.stderr).toContain("couldn't reach the broker at https://broker.test");
});

test('phone serve says so and stops when the profile is not paired', async () => {
  cli.deps = { secretStore: memorySecretStore().store };
  await cli.withProject();
  const served = await cli.mesa('phone', 'serve', '--json');
  expect(served.code).toBe(0);
  expect(served.json.data).toEqual({ ended: 'not-paired' });
  expect((await cli.mesa('phone', 'serve')).stdout).toMatch(/^not paired; mesa phone pair first/);
});
