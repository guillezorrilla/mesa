import type { NetworkInterfaceInfo } from 'node:os';
import { HOSTS_MAX, isTailnet } from '../protocol/direct.js';

/** Addresses no phone can dial: link-local (169.254/16) and a proxy's fake IPs (198.18/15, orca's). */
const UNDIALABLE = /^(169\.254|198\.1[89])\./;

/**
 * The Mac's addresses the phone may dial its direct socket at, Tailscale's first, then the LAN's
 * (orca's pairing-network-interfaces ranking). ponytail: IPv4 only; a Mac on an IPv6-only network
 * stays on the relay until IPv6 hosts are offered (they need brackets in the phone's URL).
 */
export function directHosts(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>): string[] {
  const hosts = Object.values(interfaces)
    .flatMap((addresses) => addresses ?? [])
    .filter(
      ({ family, internal, address }) =>
        family === 'IPv4' && !internal && !UNDIALABLE.test(address),
    )
    .map(({ address }) => address);
  return [...new Set([...hosts.filter(isTailnet), ...hosts])].slice(0, HOSTS_MAX);
}
