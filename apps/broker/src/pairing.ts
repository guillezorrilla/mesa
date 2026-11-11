// One Pairing (ADR-0014's 2026-11-11 amendment): a Durable Object holding a Mac's and a phone's
// token hashes, the phone's public key, and the sealed boxes each side has not taken yet. It opens
// nothing: every box is ciphertext only the two sides can read.
//
// Every read of `meta` is followed by its write with no other await between, so the runtime's
// input gate keeps another request from writing in the middle; a token is hashed before the read.
import { BOX_MAX, boxStore, KEEP_MS, type PairingStorage, type Side } from './boxes.js';
import { json } from './respond.js';
import { randomToken, sha256 } from './tokens.js';

/** The runtime's pair of joined sockets: [client, server]. */
declare const WebSocketPair: new () => { 0: WebSocket; 1: WebSocket };

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
/** What a socket carries across hibernation: when it opened, and its side once it authed. */
type Attachment = { acceptedAt: number; side?: Side };

/** A hibernatable WebSocket, as the runtime hands it back after a wake. */
export type PairingSocket = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  serializeAttachment: (value: unknown) => void;
  deserializeAttachment: () => unknown;
};
/** The Durable Object state: its storage, and the sockets it accepted. */
export type PairingObjectState = {
  storage: PairingStorage;
  acceptWebSocket: (socket: PairingSocket) => void;
  getWebSockets: () => PairingSocket[];
};

/** How long the QR's secret lets a phone join. */
export const JOIN_MS = 10 * 60_000;
/** How long a socket may stay open before its first frame authenticates it. */
export const AUTH_MS = 10_000;
/** How many sockets may wait unauthenticated at once; a newer one closes the oldest. */
export const UNAUTHED_MAX = 4;

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max;
const other = (side: Side): Side => (side === 'mac' ? 'phone' : 'mac');
const attachmentOf = (socket: PairingSocket) =>
  (socket.deserializeAttachment() ?? { acceptedAt: 0 }) as Attachment;

export class Pairing {
  private readonly storage: PairingStorage;
  private readonly boxes: ReturnType<typeof boxStore>;

  /** The runtime passes (state, env); a test passes its own clock third. */
  constructor(
    private readonly state: PairingObjectState,
    _env?: unknown,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.storage = state.storage;
    this.boxes = boxStore(state.storage, now);
  }

  private meta = () => this.storage.get<Meta>('meta');

  /** Changes `meta` from a fresh read; undefined when the pairing is gone. */
  private async update(change: (meta: Meta) => Partial<Meta>) {
    const meta = await this.meta();
    if (!meta) return undefined;
    const next = { ...meta, ...change(meta) };
    await this.storage.put('meta', next);
    return next;
  }

  private seen = (side: Side) =>
    this.update(() => ({ [`${side}SeenAt`]: this.now().toISOString() }));

  /** Sets the alarm to `at` unless one is due sooner. */
  private async wake(at: number) {
    const due = await this.storage.getAlarm();
    if (due === null || at < due) await this.storage.setAlarm(at);
  }

  private sideOf(meta: Meta, tokenHash: string | undefined): Side | undefined {
    if (!tokenHash) return undefined;
    if (tokenHash === meta.macTokenHash) return 'mac';
    if (meta.phoneTokenHash && tokenHash === meta.phoneTokenHash) return 'phone';
    return undefined;
  }

  private socketsOf(side: Side) {
    return this.state.getWebSockets().filter((socket) => attachmentOf(socket).side === side);
  }

  /** Keeps a box for the other side, hands it at once to that side's sockets, and returns its id. */
  private async store(from: Side, box: string) {
    const at = this.now().toISOString();
    const meta = await this.update((m) => ({ nextId: m.nextId + 1, [`${from}SeenAt`]: at }));
    if (!meta) return undefined;
    const stored = { id: meta.nextId - 1, box, at };
    await this.boxes.keep(other(from), stored);
    await this.wake(Date.parse(at) + KEEP_MS);
    for (const socket of this.socketsOf(other(from)))
      socket.send(JSON.stringify({ t: 'msg', ...stored }));
    return stored.id;
  }

  private async unpair() {
    for (const socket of this.state.getWebSockets()) socket.close(4000, 'unpaired');
    await this.storage.deleteAll();
    // A tombstone, so an old token hears 401 rather than 404 until it lapses.
    const gone = this.now().getTime();
    await this.storage.put('gone', gone);
    await this.storage.setAlarm(gone + KEEP_MS);
  }

  private async accept() {
    const { 0: client, 1: server } = new WebSocketPair();
    const socket = server as unknown as PairingSocket;
    const waiting = this.state.getWebSockets().filter((s) => !attachmentOf(s).side);
    for (const old of waiting.slice(0, Math.max(0, waiting.length - UNAUTHED_MAX + 1)))
      old.close(4001, 'unauthorized');
    this.state.acceptWebSocket(socket);
    const acceptedAt = this.now().getTime();
    socket.serializeAttachment({ acceptedAt } satisfies Attachment);
    await this.wake(acceptedAt + AUTH_MS);
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
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
    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
    const tokenHash = token ? await sha256(token) : undefined;
    const fresh = op === '/create' || op === '/join' ? randomToken() : undefined;
    const freshHash = fresh ? await sha256(fresh) : undefined;

    if (await this.storage.get('gone')) return json(401, { error: 'unpaired' });

    if (op === '/create' && request.method === 'POST') {
      if (!isText(fields.joinHash, 128)) return json(400, { error: 'bad_request' });
      if (await this.meta()) return json(409, { error: 'exists' });
      const created = this.now();
      const expiresAt = new Date(created.getTime() + JOIN_MS).toISOString();
      await this.storage.put('meta', {
        createdAt: created.toISOString(),
        expiresAt,
        joinHash: fields.joinHash,
        macTokenHash: freshHash as string,
        nextId: 1,
      } satisfies Meta);
      await this.wake(created.getTime() + JOIN_MS);
      return json(201, { macToken: fresh, expiresAt });
    }

    const meta = await this.meta();
    if (!meta) return json(404, { error: 'unknown_pairing' });
    if (!meta.joinedAt && this.now().toISOString() >= meta.expiresAt) {
      await this.storage.deleteAll();
      return json(410, { error: 'expired' });
    }

    if (op === '/join' && request.method === 'POST') {
      if (meta.joinedAt) return json(409, { error: 'used' });
      if (!isText(fields.joinHash, 128) || !isText(fields.phoneKey, 64))
        return json(400, { error: 'bad_request' });
      if (fields.joinHash !== meta.joinHash) return json(403, { error: 'bad_secret' });
      const joinedAt = this.now().toISOString();
      await this.storage.put('meta', {
        ...meta,
        joinHash: undefined,
        phoneTokenHash: freshHash,
        phoneKey: fields.phoneKey,
        joinedAt,
        phoneSeenAt: joinedAt,
      } satisfies Meta);
      return json(201, { phoneToken: fresh });
    }

    if (op === '/socket') {
      if (request.headers.get('upgrade') !== 'websocket')
        return json(426, { error: 'websocket_required' });
      return this.accept();
    }

    const side = this.sideOf(meta, tokenHash);
    if (!side) return json(401, { error: 'unauthorized' });

    if (op === '/' && request.method === 'GET') {
      const seen = (await this.seen(side)) ?? meta;
      const { createdAt, expiresAt, joinedAt, phoneKey, macSeenAt, phoneSeenAt } = seen;
      return json(200, { createdAt, expiresAt, joinedAt, phoneKey, macSeenAt, phoneSeenAt });
    }
    if (op === '/' && request.method === 'DELETE') {
      await this.unpair();
      return json(204);
    }
    if (op === '/messages' && request.method === 'POST') {
      if (!meta.joinedAt) return json(409, { error: 'not_joined' });
      if (!isText(fields.box, BOX_MAX)) return json(400, { error: 'bad_request' });
      const id = await this.store(side, fields.box);
      return id === undefined ? json(404, { error: 'unknown_pairing' }) : json(201, { id });
    }
    if (op === '/messages' && request.method === 'GET') {
      await this.seen(side);
      return json(200, { messages: await this.boxes.waiting(side) });
    }
    if (op === '/ack' && request.method === 'POST') {
      if (!Number.isInteger(fields.upTo)) return json(400, { error: 'bad_request' });
      await this.boxes.ack(side, fields.upTo as number);
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
    let frame: Record<string, unknown> = {};
    try {
      frame = typeof data === 'string' ? JSON.parse(data) : {};
    } catch {}
    const attachment = attachmentOf(socket);
    if (!attachment.side) {
      const tokenHash = typeof frame.token === 'string' ? await sha256(frame.token) : undefined;
      const meta = await this.meta();
      const side = frame.t === 'auth' && meta ? this.sideOf(meta, tokenHash) : undefined;
      if (!side) return socket.close(4001, 'unauthorized');
      socket.serializeAttachment({ ...attachment, side } satisfies Attachment);
      await this.seen(side);
      socket.send(JSON.stringify({ t: 'ready' }));
      for (const box of await this.boxes.waiting(side))
        socket.send(JSON.stringify({ t: 'msg', ...box }));
      return;
    }
    const meta = await this.meta();
    if (!meta) return socket.close(4004, 'unknown_pairing');
    if (frame.t === 'send' && isText(frame.box, BOX_MAX) && meta.joinedAt) {
      await this.store(attachment.side, frame.box);
      return;
    }
    if (frame.t === 'ack' && Number.isInteger(frame.upTo))
      return this.boxes.ack(attachment.side, frame.upTo as number);
    socket.close(4000, 'bad_frame');
  }

  /**
   * The one alarm: forgets a tombstone after KEEP_MS and a pairing no phone joined in time, closes
   * sockets that never authed, drops boxes past KEEP_MS, then sets itself for the next of those.
   */
  async alarm() {
    const now = this.now().getTime();
    const gone = await this.storage.get<number>('gone');
    if (gone !== undefined) {
      if (now >= gone + KEEP_MS) await this.storage.deleteAll();
      else await this.storage.setAlarm(gone + KEEP_MS);
      return;
    }
    const meta = await this.meta();
    if (!meta) return;
    if (!meta.joinedAt && now >= Date.parse(meta.expiresAt)) {
      for (const socket of this.state.getWebSockets()) socket.close(4010, 'expired');
      await this.storage.deleteAll();
      return;
    }
    const next: number[] = meta.joinedAt ? [] : [Date.parse(meta.expiresAt)];
    for (const socket of this.state.getWebSockets()) {
      const { acceptedAt, side } = attachmentOf(socket);
      if (side) continue;
      if (now >= acceptedAt + AUTH_MS) socket.close(4001, 'unauthorized');
      else next.push(acceptedAt + AUTH_MS);
    }
    const expiry = await this.boxes.nextExpiry();
    if (expiry !== undefined) next.push(expiry);
    if (next.length) await this.storage.setAlarm(Math.min(...next));
  }
}
