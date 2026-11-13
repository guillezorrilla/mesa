import type { PhonePairing } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { type KeyValue, pairingKeys } from './pairingKeys';

const memory = () => {
  const map = new Map<string, string>();
  const kv: KeyValue = {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => void map.set(key, value),
    remove: async (key) => void map.delete(key),
  };
  return { map, kv };
};

const pairing = (pairingId: string): PhonePairing => ({
  broker: 'https://broker.test',
  pairingId,
  phoneToken: 't',
  privateKey: 'k',
  macKey: 'm',
  sentSeq: 1,
  takenSeq: 0,
});

test('several pairings each keep their own entry, and one is forgotten alone', async () => {
  const { map, kv } = memory();
  const keys = pairingKeys(kv);
  await keys.add(pairing('studio-0000000001'));
  await keys.add(pairing('laptop-0000000002'));
  await keys.add({ ...pairing('studio-0000000001'), takenSeq: 9 });
  expect((await keys.read()).map((p) => [p.pairingId, p.takenSeq])).toEqual([
    ['studio-0000000001', 9],
    ['laptop-0000000002', 0],
  ]);
  await keys.forget('studio-0000000001');
  expect((await keys.read()).map((p) => p.pairingId)).toEqual(['laptop-0000000002']);
  expect(map.has('mesa.pairing.studio-0000000001')).toBe(false);
  await keys.write({ ...pairing('studio-0000000001'), takenSeq: 12 });
  expect(map.has('mesa.pairing.studio-0000000001')).toBe(false);
});

test('a phone paired before several Macs keeps its pairing, in its own entry and the legacy key', async () => {
  const { map, kv } = memory();
  map.set('mesa.pairing', JSON.stringify(pairing('legacy-0000000001')));
  expect((await pairingKeys(kv).read()).map((p) => p.pairingId)).toEqual(['legacy-0000000001']);
  expect([...map.keys()].sort()).toEqual([
    'mesa.pairing',
    'mesa.pairing.legacy-0000000001',
    'mesa.pairings',
  ]);
});

test('the legacy key, which an older extension reads, always holds the first pairing kept', async () => {
  const { map, kv } = memory();
  const keys = pairingKeys(kv);
  const legacy = () => JSON.parse(map.get('mesa.pairing') ?? 'null')?.pairingId;
  await keys.add(pairing('studio-0000000001'));
  await keys.add(pairing('laptop-0000000002'));
  expect(legacy()).toBe('studio-0000000001');
  await keys.forget('laptop-0000000002');
  expect(legacy()).toBe('studio-0000000001');
  await keys.add(pairing('laptop-0000000002'));
  await keys.forget('studio-0000000001');
  expect(legacy()).toBe('laptop-0000000002');
  await keys.forget('laptop-0000000002');
  expect(map.has('mesa.pairing')).toBe(false);
});
