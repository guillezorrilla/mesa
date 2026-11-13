import { type AddressInfo, BlockList, isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { WebSocketServer } from 'ws';
import type { AcceptedSocket } from '../protocol/mailbox.js';
import { directHosts } from './direct-hosts.js';

/** What the listener does with a socket the phone opened: feed it frames and its close. */
export type DirectAccept = (peer: AcceptedSocket) => {
  message: (data: string) => void;
  close: () => void;
};
/** The Mac's direct socket: its port, the addresses to offer, and close. */
export type DirectServer = { port: number; hosts: () => string[]; close: () => void };
/** Starts the Mac's direct socket: `ws` on every interface for real, an in-memory one in tests. */
export type DirectListen = (accept: DirectAccept) => Promise<DirectServer>;

/** The peers a direct socket admits: loopback, a LAN's private ranges and a tailnet (orca's network-source-class). */
const NEARBY = new BlockList();
for (const [network, prefix] of [
  ['127.0.0.0', 8],
  ['10.0.0.0', 8],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['169.254.0.0', 16],
  ['100.64.0.0', 10],
] as const)
  NEARBY.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
] as const)
  NEARBY.addSubnet(network, prefix, 'ipv6');

/** Whether a peer's address is nearby; a dual-stack socket names IPv4 peers `::ffff:a.b.c.d`. */
export function isNearby(address: string | undefined): boolean {
  const bare = (address ?? '').split('%')[0]?.replace(/^::ffff:(?=\d+\.)/, '') ?? '';
  const family = isIP(bare);
  return family !== 0 && NEARBY.check(bare, family === 4 ? 'ipv4' : 'ipv6');
}

/** A box is at most 8,192 characters (ADR-0014); a frame holds one with a little JSON around it. */
const FRAME_MAX = 16 * 1024;

/** The Mac's direct socket on a free port of every interface, refusing peers from afar. */
export const wsDirectListen: DirectListen = (accept) =>
  new Promise((resolve, reject) => {
    const server = new WebSocketServer({ host: '::', port: 0, maxPayload: FRAME_MAX });
    server.once('error', reject);
    server.on('connection', (socket, request) => {
      if (!isNearby(request.socket.remoteAddress)) return socket.terminate();
      const peer = accept({ send: (data) => socket.send(data), close: () => socket.close() });
      socket.on('message', (data) => peer.message(String(data)));
      socket.on('close', peer.close);
      socket.on('error', () => socket.terminate());
    });
    server.once('listening', () => {
      resolve({
        port: (server.address() as AddressInfo).port,
        hosts: () => directHosts(networkInterfaces()),
        close: () => {
          for (const client of server.clients) client.terminate();
          server.close();
        },
      });
    });
  });
