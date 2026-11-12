import { newKeyPair, sealNotice, sideKeys } from '@mesa/core/phone';
import type { NotificationResponse } from 'expo-notifications';
import { expect, test } from 'vitest';
import { tappedHref } from './tappedHref';

const tap = (trigger: unknown) =>
  ({ notification: { request: { trigger } } }) as unknown as NotificationResponse;

test("a tapped push opens the session its payload names, and nothing else's", () => {
  expect(tappedHref(tap({ type: 'push', payload: { session: 'k3m9q2xz', aps: {} } }))).toBe(
    '/agents/k3m9q2xz',
  );
  expect(tappedHref(tap({ type: 'push', payload: { aps: {} } }))).toBeUndefined();
  expect(tappedHref(tap({ type: 'push', payload: { session: '../x' } }))).toBeUndefined();
  expect(tappedHref(tap(null))).toBeUndefined();
  expect(tappedHref(tap({ type: 'date', payload: { session: 'k3m9q2xz' } }))).toBeUndefined();
});

test('a tapped approval push opens Automations, read from its sealed notice with the keys', () => {
  const [mac, phone] = [newKeyPair(), newKeyPair()];
  const pairingId = 'pairing-0000000001';
  const macKeys = sideKeys({
    side: 'mac',
    privateKey: mac.privateKey,
    peerPublicKey: phone.publicKey,
    pairingId,
  });
  const phoneKeys = sideKeys({
    side: 'phone',
    privateKey: phone.privateKey,
    peerPublicKey: mac.publicKey,
    pairingId,
  });
  const n = sealNotice(macKeys, { title: 'Automation asks', body: '', run: '01JD0000000000' });
  expect(tappedHref(tap({ type: 'push', payload: { n } }), phoneKeys)).toBe('/automations');
  expect(tappedHref(tap({ type: 'push', payload: { n } }))).toBeUndefined();
  const plain = sealNotice(macKeys, { title: 'Mesa', body: 'A test' });
  expect(tappedHref(tap({ type: 'push', payload: { n: plain } }), phoneKeys)).toBeUndefined();
});
