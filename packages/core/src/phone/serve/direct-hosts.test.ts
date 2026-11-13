import type { NetworkInterfaceInfo } from 'node:os';
import { expect, test } from 'vitest';
import { directHosts } from './direct-hosts.js';
import { isNearby } from './direct-socket.js';

const at = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4', internal = false) =>
  ({ address, family, internal }) as NetworkInterfaceInfo;

test('the Mac offers its Tailscale address first, then its LAN ones, never loopback, link-local or IPv6', () => {
  expect(
    directHosts({
      lo0: [at('127.0.0.1', 'IPv4', true), at('::1', 'IPv6', true)],
      en0: [at('192.168.1.20'), at('fe80::1', 'IPv6'), at('169.254.3.4')],
      utun4: [at('100.101.102.103'), at('fd7a:115c:a1e0::1', 'IPv6')],
      utun9: [at('198.18.0.1')],
    }),
  ).toEqual(['100.101.102.103', '192.168.1.20']);
});

test('the direct socket admits loopback, LAN and tailnet peers, and refuses the internet', () => {
  for (const near of ['127.0.0.1', '::ffff:192.168.1.7', '10.0.0.3', '100.90.1.2', 'fe80::1%en0'])
    expect(isNearby(near), near).toBe(true);
  for (const far of ['8.8.8.8', '::ffff:1.1.1.1', '2001:4860::8888', undefined])
    expect(isNearby(far), String(far)).toBe(false);
});
