// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { PAIRING_POLL_MS } from '../phone/usePhonePairing';
import { PhoneSettingsPanel } from './PhoneSettingsPanel';

const PAIRED = {
  paired: true,
  pairingId: 'pairing-0000000001',
  since: '2026-09-24T12:00:00.000Z',
  phoneLastSeen: '2026-09-24T12:00:00.000Z',
};

const row = () => document.querySelector<HTMLElement>('[data-setting-row]');
const button = (label: string) =>
  [...(row()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(
    (b) => b.textContent === label,
  );

test('Pair phone shows the QR and asks every 2 s until the phone scans it, then shows it paired', async () => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'Date'],
    now: Date.parse('2026-09-24T12:00:00.000Z'),
  });
  try {
    let status: object = { paired: false };
    const { bridge, calls } = fakeBridge({
      'phone status': () => envelope(status),
      'phone pair': () => {
        status = { paired: false, pending: true, pairingId: 'pairing-0000000001' };
        return envelope({
          pairingId: 'pairing-0000000001',
          qr: 'mesa://pair?v=1',
          expiresAt: '2026-09-24T12:10:00.000Z',
          svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          receipt: null,
        });
      },
    });
    await renderWithMesa(<PhoneSettingsPanel />, bridge);
    expect(row()?.textContent).toContain('Get pinged on your phone');

    await click(button('Pair phone'));
    const qr = row()?.querySelector('img');
    expect(qr?.getAttribute('alt')).toBe('Pairing QR code');
    expect(qr?.getAttribute('src')).toMatch(/^data:image\/svg\+xml;utf8,%3Csvg/);
    expect(row()?.textContent).toContain('Scan the code with the Mesa app');
    expect(button('New code')).toBeTruthy();

    const reads = () => calls.filter((c) => c[1] === 'phone' && c[2] === 'status').length;
    const before = reads();
    status = PAIRED;
    await act(async () => void vi.advanceTimersByTime(PAIRING_POLL_MS));
    expect(reads()).toBe(before + 1);
    expect(row()?.querySelector('img')).toBeNull();
    expect(row()?.textContent).toContain('Phone paired');
    expect(button('Unpair')).toBeTruthy();
  } finally {
    vi.useRealTimers();
  }
});

test('a paired profile shows when it paired and offers Unpair, which ends it', async () => {
  let status: object = PAIRED;
  const { bridge, calls } = fakeBridge({
    'phone status': () => envelope(status),
    'phone unpair': () => {
      status = { paired: false };
      return envelope({
        unpaired: true,
        pairingId: 'pairing-0000000001',
        brokerRemoved: true,
        receipt: null,
      });
    },
  });
  await renderWithMesa(<PhoneSettingsPanel />, bridge);
  expect(row()?.textContent).toContain('Phone paired');
  expect(row()?.textContent).toContain('phone last seen');
  await click(button('Unpair'));
  expect(calls).toContainEqual(expect.arrayContaining(['phone', 'unpair']));
  expect(row()?.textContent).toContain('Pair phone');
});

test('a code no phone scanned goes away when it expires, and stops asking', async () => {
  vi.useFakeTimers({
    toFake: ['setInterval', 'clearInterval', 'Date'],
    now: Date.parse('2026-09-24T12:00:00.000Z'),
  });
  try {
    const { bridge, calls } = fakeBridge({
      'phone status': () => envelope({ paired: false, pending: true }),
      'phone pair': () =>
        envelope({
          pairingId: 'pairing-0000000001',
          qr: 'mesa://pair?v=1',
          expiresAt: '2026-09-24T12:10:00.000Z',
          svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
          receipt: null,
        }),
    });
    await renderWithMesa(<PhoneSettingsPanel />, bridge);
    await click(button('Pair phone'));
    expect(row()?.querySelector('img')).not.toBeNull();
    await act(async () => void vi.advanceTimersByTime(10 * 60_000));
    expect(row()?.querySelector('img')).toBeNull();
    expect(button('Pair phone')).toBeTruthy();
    const reads = calls.filter((c) => c[2] === 'status').length;
    await act(async () => void vi.advanceTimersByTime(10_000));
    expect(calls.filter((c) => c[2] === 'status').length).toBe(reads);
  } finally {
    vi.useRealTimers();
  }
});
