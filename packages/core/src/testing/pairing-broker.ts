import type { Http } from '../lib/http.js';

type Box = { id: number; box: string; at: string; to: 'mac' | 'phone' };
type Room = {
  joinHash?: string;
  macToken: string;
  phoneToken?: string;
  phoneKey?: string;
  joinedAt?: string;
  expiresAt: string;
  boxes: Box[];
};

/**
 * The broker's pairing routes in memory (apps/broker's Pairing has the real ones), as fetch-shaped
 * `http` at `broker`: enough for core's pairing and the fake phone to talk through. `now` is the
 * clock it stamps with; `rooms` is what it holds, for a test to inspect.
 */
export function fakePairingBroker(broker = 'https://broker.test', now = () => new Date()) {
  const rooms = new Map<string, Room>();
  let next = 0;
  const answer = (status: number, body?: unknown) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });
  const http: Http = async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : {};
    const token = new Headers(init.headers).get('authorization')?.replace('Bearer ', '');
    const [, , id = '', op = ''] = pathname.split('/');
    if (!url.startsWith(broker)) return answer(404, { error: 'not_found' });
    if (!id && method === 'POST') {
      const pairingId = `pairing-${String(++next).padStart(10, '0')}`;
      const expiresAt = new Date(now().getTime() + 10 * 60_000).toISOString();
      rooms.set(pairingId, {
        joinHash: body.joinHash,
        macToken: `mac-token-${next}`,
        expiresAt,
        boxes: [],
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
    if (op === 'messages' && method === 'POST') {
      const box = {
        id: ++next,
        box: body.box,
        at: now().toISOString(),
        to: side === 'mac' ? 'phone' : 'mac',
      } as const;
      room.boxes.push(box);
      return answer(201, { id: box.id });
    }
    if (op === 'messages')
      return answer(200, {
        messages: room.boxes.filter((box) => box.to === side).map(({ to: _, ...box }) => box),
      });
    if (op === 'ack') {
      room.boxes = room.boxes.filter((box) => box.to !== side || box.id > body.upTo);
      return answer(204);
    }
    return answer(404, { error: 'not_found' });
  };
  return { http, rooms, broker };
}
