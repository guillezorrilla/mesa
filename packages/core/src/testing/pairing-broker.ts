import type { Http } from '../lib/http.js';
import type { ConnectSocket, SocketEvents } from '../phone/protocol/mailbox.js';

type Side = 'mac' | 'phone';
type Box = { id: number; box: string; at: string; to: Side };
type Socket = { pairingId: string; side?: Side; on: SocketEvents };
type Room = {
  joinHash?: string;
  macToken: string;
  phoneToken?: string;
  phoneKey?: string;
  joinedAt?: string;
  expiresAt: string;
  boxes: Box[];
  deviceToken?: string;
  /** What the broker pushed to the phone: the fixed alert's kind and the sealed notice. */
  pushes: { kind: string; notice: string }[];
};

/**
 * The broker's pairing routes in memory (apps/broker's Pairing has the real ones), as fetch-shaped
 * `http` at `broker`, and its WebSocket as `connect`: enough for core's pairing, the Mac's listener
 * and the fake phone to talk through. `now` is the clock it stamps with; `rooms` is what it holds,
 * for a test to inspect, and `drop` closes a side's sockets as a lost connection would.
 */
export function fakePairingBroker(broker = 'https://broker.test', now = () => new Date()) {
  const rooms = new Map<string, Room>();
  const sockets = new Set<Socket>();
  let next = 0;
  const hand = (socket: Socket, box: Omit<Box, 'to'>) =>
    queueMicrotask(() => socket.on.message(JSON.stringify({ t: 'msg', ...box })));
  /** Keeps a box for the other side and hands it at once to that side's sockets. */
  const store = (pairingId: string, room: Room, from: Side, box: string) => {
    const kept = {
      id: ++next,
      box,
      at: now().toISOString(),
      to: from === 'mac' ? 'phone' : 'mac',
    } as const;
    room.boxes.push(kept);
    for (const socket of sockets)
      if (socket.pairingId === pairingId && socket.side === kept.to)
        hand(socket, { id: kept.id, box, at: kept.at });
    return kept.id;
  };
  const connect: ConnectSocket = (url, on) => {
    const pairingId = decodeURIComponent(new URL(url).pathname.split('/')[2] ?? '');
    const socket: Socket = { pairingId, on };
    sockets.add(socket);
    queueMicrotask(on.open);
    const close = () => {
      if (sockets.delete(socket)) queueMicrotask(on.close);
    };
    return {
      close,
      send: (data) => {
        const frame = JSON.parse(data);
        const room = rooms.get(pairingId);
        if (!room) return close();
        if (!socket.side) {
          const side =
            frame.t === 'auth' && frame.token === room.macToken
              ? 'mac'
              : frame.t === 'auth' && frame.token === room.phoneToken
                ? 'phone'
                : undefined;
          if (!side) return close();
          socket.side = side;
          queueMicrotask(() => on.message(JSON.stringify({ t: 'ready' })));
          for (const { to, ...box } of room.boxes) if (to === side) hand(socket, box);
          return;
        }
        if (frame.t === 'send') return void store(pairingId, room, socket.side, frame.box);
        if (frame.t === 'ack')
          room.boxes = room.boxes.filter((box) => box.to !== socket.side || box.id > frame.upTo);
      },
    };
  };
  const drop = (side: Side) => {
    for (const socket of [...sockets])
      if (socket.side === side && sockets.delete(socket)) queueMicrotask(socket.on.close);
  };
  const answer = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const http: Http = async (url, init = {}) => {
    const { origin, pathname } = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '');
    const [, , id = '', op = ''] = pathname.split('/');
    if (origin !== new URL(broker).origin) return answer(404, { error: 'not_found' });
    if (!id && method === 'POST') {
      const pairingId = `pairing-${String(++next).padStart(10, '0')}`;
      const expiresAt = new Date(now().getTime() + 10 * 60_000).toISOString();
      rooms.set(pairingId, {
        joinHash: body.joinHash,
        macToken: `mac-token-${next}`,
        expiresAt,
        boxes: [],
        pushes: [],
      });
      return answer(201, { pairingId, macToken: `mac-token-${next}`, expiresAt });
    }
    const room = rooms.get(id);
    if (!room) return answer(404, { error: 'unknown_pairing' });
    if (!room.joinedAt && now().toISOString() >= room.expiresAt) {
      rooms.delete(id);
      return answer(410, { error: 'expired' });
    }
    if (op === 'join') {
      if (room.joinedAt) return answer(409, { error: 'used' });
      if (body.joinHash !== room.joinHash) return answer(403, { error: 'bad_secret' });
      Object.assign(room, {
        phoneToken: `phone-token-${id}`,
        phoneKey: body.phoneKey,
        joinedAt: now().toISOString(),
      });
      return answer(201, { phoneToken: room.phoneToken });
    }
    const side =
      token === room.macToken ? 'mac' : token && token === room.phoneToken ? 'phone' : undefined;
    if (!side) return answer(401, { error: 'unauthorized' });
    if (!op && method === 'GET') {
      const { expiresAt, joinedAt, phoneKey } = room;
      return answer(200, {
        createdAt: expiresAt,
        expiresAt,
        joinedAt,
        phoneKey,
        phoneSeenAt: joinedAt,
      });
    }
    if (!op && method === 'DELETE') {
      rooms.delete(id);
      return answer(204);
    }
    if (op === 'messages' && method === 'POST')
      return answer(201, { id: store(id, room, side, body.box) });
    if (op === 'messages')
      return answer(200, {
        messages: room.boxes.filter((box) => box.to === side).map(({ to: _, ...box }) => box),
      });
    if (op === 'device' && side === 'phone') {
      room.deviceToken = body.deviceToken;
      return answer(204);
    }
    if (op === 'push' && side === 'mac') {
      if (!room.deviceToken) return answer(409, { error: 'no_device' });
      room.pushes.push({ kind: body.kind, notice: body.notice });
      return answer(200, { sent: true });
    }
    if (op === 'ack') {
      room.boxes = room.boxes.filter((box) => box.to !== side || box.id > body.upTo);
      return answer(204);
    }
    return answer(404, { error: 'not_found' });
  };
  return { http, connect, drop, rooms, broker };
}
