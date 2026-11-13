// The direct path (#1129): the phone talks to the Mac's own socket on the same Wi-Fi or over
// Tailscale, and through the broker's relay elsewhere, as orca's app does. The Mac's addresses
// travel sealed; nothing about them is ever sent in plain text.
import { z } from 'zod';

/**
 * The phone's `{kind: 'direct'}` asks the Mac where its socket is, and is also the sealed box that
 * opens a direct socket; the Mac answers with its `port` and `hosts` (none when it has no socket).
 */
/** The most addresses the Mac offers. */
export const HOSTS_MAX = 8;

export const directMessage = z.object({
  kind: z.literal('direct'),
  port: z.number().int().min(1).max(65_535).optional(),
  hosts: z.array(z.ipv4()).max(HOSTS_MAX).optional(),
});
export type DirectMessage = z.infer<typeof directMessage>;

/** How the phone reaches the Mac: by the broker, or directly on a LAN or a tailnet. */
export type MacPath = 'relay' | 'lan' | 'tailscale';

/** Tailscale's addresses: 100.64.0.0/10 (orca's classifyRemotePairingHostname). */
export const isTailnet = (host: string) => {
  const [a, b] = host.split('.').map(Number);
  return a === 100 && b !== undefined && b >= 64 && b <= 127;
};

/** The URLs the phone dials for the Mac's answer, or none when the Mac has no socket. */
export const directUrls = ({ port, hosts }: DirectMessage): string[] =>
  port ? (hosts ?? []).map((host) => `ws://${host}:${port}/`) : [];

/** The path a direct URL dialed is on. */
export const pathOfUrl = (url: string): Exclude<MacPath, 'relay'> =>
  isTailnet(new URL(url).hostname) ? 'tailscale' : 'lan';
