// One Pairing (ADR-0014's 2026-11-11 amendment): a Durable Object holding a Mac's and a phone's
// token hashes, the phone's public key, and the sealed boxes each side has not taken yet. It opens
// nothing: every box is ciphertext only the two sides can read.

/** The runtime's pair of joined sockets: [client, server]. */
declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };

type Side = 'mac' | 'phone';
type Meta = {
  createdAt: string;
  expiresAt: string;
  /** The hash of the QR's secret, kept until the phone joins. */
  joinHash?: string;
  macTokenHash: string;
  phoneTokenHash?: string;
  phoneKey?: string;
  joinedAt?: string;
  macSeenAt?: string;
  phoneSeenAt?: string;
  nextId: number;
};
type Stored = { id: number; box: string; at: string };

/** The part of a Durable Object's storage a Pairing uses: the KV API, which SQLite backs. */
export type PairingStorage = {
  get: <T>(key: string) => Promise<T | undefined>;
  put: (key: string, value: unknown) => Promise<void>;
  delete: (keys: string[]) => Promise<number>;
  list: <T>(options: { prefix: string }) => Promise<Map<string, T>>;
  deleteAll: () => Promise<void>;
  setAlarm: (at: number) => Promise<void>;
};
/** A hibernatable WebSocket, as the runtime hands it back after a wake. */
export type PairingSocket = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  serializeAttachment: (value: unknown) => void;
  deserializeAttachment: () => unknown;
};
/** The Durable Object state: its storage, and the sockets it accepted. */
export type PairingState = {
  storage: PairingStorage;
  acceptWebSocket: (socket: PairingSocket) => void;
  getWebSockets: () => PairingSocket[];
};

/** How long the QR's secret lets a phone join. */
export const JOIN_MS = 10 * 60_000;
/** How long a box waits for a side that does not come. */
export const KEEP_MS = 7 * 24 * 60 * 60_000;
/** How many boxes wait for one side; a newer one drops the oldest. */
export const KEEP_COUNT = 200;
/** The longest box taken, in base64url characters. */
export const BOX_MAX = 8192;

const json = (status: number, body?: unknown) =>
  body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      });

const encoder = new TextEncoder();
export async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
export function randomToken(bytes = 32) {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...random))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const boxKey = (side: Side, id: number) => `box:${side}:${String(id).padStart(12, '0')}`;
const other = (side: Side): Side => (side === 'mac' ? 'phone' : 'mac');

export class Pairing {
  constructor(
    private readonly state: PairingState,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private meta = () => this.state.storage.get<Meta>('meta');

  /** Which side `token` belongs to, or undefined. */
  private async sideOf(meta: Meta, token: string | undefined): Promise<Side | undefined> {
    if (!token) return undefined;
    const hash = await sha256(token);
    if (hash === meta.macTokenHash) return 'mac';
    if (meta.phoneTokenHash && hash === meta.phoneTokenHash) return 'phone';
    return undefined;
  }

  private async seen(meta: Meta, side: Side) {
    await this.state.storage.put('meta', { ...meta, [`${side}SeenAt`]: this.now().toISOString() });
  }

  /** The boxes waiting for `side`, oldest first, after dropping any past KEEP_MS. */
  private async waiting(side: Side): Promise<Stored[]> {
    const boxes = [...(await this.state.storage.list<Stored>({ prefix: `box:${side}:` })).values()];
    const cutoff = this.now().getTime() - KEEP_MS;
    const stale = boxes.filter((box) => Date.parse(box.at) < cutoff);
    if (stale.length) await this.state.storage.delete(stale.map((box) => boxKey(side, box.id)));
    return boxes.filter((box) => Date.parse(box.at) >= cutoff);
  }

  private socketsOf(side: Side) {
    return this.state
      .getWebSockets()
      .filter(
        (socket) => (socket.deserializeAttachment() as { side?: Side } | null)?.side === side,
      );
  }

  /** Keeps a box for the other side and hands it over at once to its open sockets. */
  private async store(meta: Meta, from: Side, box: string): Promise<number> {
    const to = other(from);
    const stored: Stored = { id: meta.nextId, box, at: this.now().toISOString() };
    await this.state.storage.put('meta', {
      ...meta,
      nextId: meta.nextId + 1,
      [`${from}SeenAt`]: stored.at,
    });
    await this.state.storage.put(boxKey(to, stored.id), stored);
    const waiting = await this.waiting(to);
    const over = waiting.slice(0, Math.max(0, waiting.length - KEEP_COUNT));
    if (over.length) await this.state.storage.delete(over.map((old) => boxKey(to, old.id)));
    for (const socket of this.socketsOf(to)) socket.send(JSON.stringify({ t: 'msg', ...stored }));
    return stored.id;
  }

  private async ack(side: Side, upTo: number) {
    const taken = (await this.waiting(side)).filter((box) => box.id <= upTo);
    if (taken.length) await this.state.storage.delete(taken.map((box) => boxKey(side, box.id)));
  }

  /** Requests the Worker forwards: `/<op>`, the op after `/pairings/<id>`. */
  async fetch(request: Request): Promise<Response> {
    const op = new URL(request.url).pathname;
    const body =
      request.method === 'POST' ? await request.json().catch(() => undefined) : undefined;
    const fields = (typeof body === 'object' && body !== null ? body : {}) as Record<
      string,
      unknown
    >;

    if (op === '/create' && request.method === 'POST') {
      if (await this.meta()) return json(409, { error: 'exists' });
      if (!isText(fields.joinHash, 128)) return json(400, { error: 'bad_request' });
      const macToken = randomToken();
      const created = this.now();
      const expiresAt = new Date(created.getTime() + JOIN_MS).toISOString();
      await this.state.storage.put('meta', {
        createdAt: created.toISOString(),
        expiresAt,
        joinHash: fields.joinHash,
        macTokenHash: await sha256(macToken),
        nextId: 1,
      } satisfies Meta);
      await this.state.storage.setAlarm(created.getTime() + JOIN_MS);
      return json(201, { macToken, expiresAt });
    }

    const meta = await this.meta();
    if (!meta) return json(404, { error: 'unknown_pairing' });
    if (!meta.joinedAt && this.now().toISOString() >= meta.expiresAt) {
      await this.state.storage.deleteAll();
      return json(410, { error: 'expired' });
    }

    if (op === '/join' && request.method === 'POST') {
      if (meta.joinedAt) return json(409, { error: 'used' });
      if (!isText(fields.joinHash, 128) || !isText(fields.phoneKey, 64))
        return json(400, { error: 'bad_request' });
      if (fields.joinHash !== meta.joinHash) return json(403, { error: 'bad_secret' });
      const phoneToken = randomToken();
      const joinedAt = this.now().toISOString();
      await this.state.storage.put('meta', {
        ...meta,
        joinHash: undefined,
        phoneTokenHash: await sha256(phoneToken),
        phoneKey: fields.phoneKey,
        joinedAt,
        phoneSeenAt: joinedAt,
      } satisfies Meta);
      return json(201, { phoneToken });
    }

    if (op === '/socket') {
      if (request.headers.get('upgrade') !== 'websocket')
        return json(426, { error: 'websocket_required' });
      const { 0: client, 1: server } = new WebSocketPair();
      this.state.acceptWebSocket(server as unknown as PairingSocket);
      return new Response(null, { status: 101, webSocket: client } as ResponseInit);
    }

    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    const side = await this.sideOf(meta, token);
    if (!side) return json(401, { error: 'unauthorized' });

    if (op === '/' && request.method === 'GET') {
      await this.seen(meta, side);
      const { createdAt, expiresAt, joinedAt, phoneKey, macSeenAt, phoneSeenAt } = meta;
      return json(200, { createdAt, expiresAt, joinedAt, phoneKey, macSeenAt, phoneSeenAt });
    }
    if (op === '/' && request.method === 'DELETE') {
      for (const socket of this.state.getWebSockets()) socket.close(4000, 'unpaired');
      await this.state.storage.deleteAll();
      return json(204);
    }
    if (op === '/messages' && request.method === 'POST') {
      if (!meta.joinedAt) return json(409, { error: 'not_joined' });
      if (!isText(fields.box, BOX_MAX)) return json(400, { error: 'bad_request' });
      return json(201, { id: await this.store(meta, side, fields.box) });
    }
    if (op === '/messages' && request.method === 'GET') {
      await this.seen(meta, side);
      return json(200, { messages: await this.waiting(side) });
    }
    if (op === '/ack' && request.method === 'POST') {
      if (!Number.isInteger(fields.upTo)) return json(400, { error: 'bad_request' });
      await this.ack(side, fields.upTo as number);
      return json(204);
    }
    return json(404, { error: 'not_found' });
  }

  /**
   * A socket's frames: first `{t: 'auth', token}`, answered `{t: 'ready'}` and every waiting box as
   * `{t: 'msg', id, box, at}`; then `{t: 'send', box}` and `{t: 'ack', upTo}`. Anything else, or
   * a frame before a good auth, closes it.
   */
  async webSocketMessage(socket: PairingSocket, data: string | ArrayBuffer) {
    const meta = await this.meta();
    let frame: Record<string, unknown> = {};
    try {
      frame = typeof data === 'string' ? JSON.parse(data) : {};
    } catch {}
    const side = (socket.deserializeAttachment() as { side?: Side } | null)?.side;
    if (!meta) return socket.close(4004, 'unknown_pairing');
    if (!side) {
      const authed =
        frame.t === 'auth' && typeof frame.token === 'string'
          ? await this.sideOf(meta, frame.token)
          : undefined;
      if (!authed) return socket.close(4001, 'unauthorized');
      socket.serializeAttachment({ side: authed });
      await this.seen(meta, authed);
      socket.send(JSON.stringify({ t: 'ready' }));
      for (const box of await this.waiting(authed))
        socket.send(JSON.stringify({ t: 'msg', ...box }));
      return;
    }
    if (frame.t === 'send' && isText(frame.box, BOX_MAX) && meta.joinedAt) {
      await this.store(meta, side, frame.box);
      return;
    }
    if (frame.t === 'ack' && Number.isInteger(frame.upTo))
      return this.ack(side, frame.upTo as number);
    socket.close(4000, 'bad_frame');
  }

  /** The QR expired with no phone: nothing of the pairing stays. */
  async alarm() {
    const meta = await this.meta();
    if (meta && !meta.joinedAt) await this.state.storage.deleteAll();
  }
}
