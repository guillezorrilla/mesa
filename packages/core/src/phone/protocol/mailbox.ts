// One side's end of a Pairing's Mailbox over the broker's WebSocket (ADR-0014's 2026-11-11
// amendment): it authenticates, opens each box the broker hands over, puts parts back together,
// acks, and seals what this side sends, cutting a message over one box into parts. The Mac's
// listener and the phone app both run it; what to do on a close (reconnect, or wait) is theirs.
// The same boxes also go over the direct path (#1129): a socket the phone dials to the Mac's own
// (`dial`), which the Mac takes (`accept`); one seq count spans both, so a box is taken once.
import { fitsOneBox, PART_TIMEOUT_MS, partJoiner, splitParts } from './chunk.js';
import { openMessage, type PhoneMessage, phoneMessage, sealMessage } from './envelope.js';
import type { SideKeys } from './seal.js';
import { takenSeqs } from './taken.js';

/** What a side does with a socket's events. */
export type SocketEvents = {
  open: () => void;
  message: (data: string) => void;
  close: () => void;
};
/** Opens a WebSocket to `url`: the global one on both sides (webSocketConnect), a fake in tests. */
export type ConnectSocket = (
  url: string,
  on: SocketEvents,
) => { send: (data: string) => void; close: () => void };

/** The runtime's own WebSocket (Node's and React Native's are the same shape here). */
export const webSocketConnect: ConnectSocket = (url, on) => {
  const socket = new WebSocket(url);
  socket.onopen = on.open;
  socket.onmessage = (event) => on.message(String(event.data));
  socket.onclose = on.close;
  return { send: (data) => socket.send(data), close: () => socket.close() };
};

/** This side of a pairing, as the mailbox needs it. */
export type MailboxEnd = {
  broker: string;
  pairingId: string;
  token: string;
  keys: SideKeys;
  /** The last seq this side sent and the last it took, as kept between runs. */
  sentSeq: number;
  takenSeq: number;
};

export type MailboxEvents = {
  /** A whole message from the other side, parts put back together. */
  message: (message: PhoneMessage) => void;
  /** The broker took this side's token; boxes sent before now go out. */
  ready?: () => void;
  /** The socket closed without this side asking; the mailbox connects again only when told. */
  closed?: () => void;
  /** The last seq taken moved on: the side keeps it, so a replayed box is refused after a restart. */
  taken?: (seq: number) => void;
  /** A payload whose parts did not all come within PART_TIMEOUT_MS: its id. */
  lost?: (id: string) => void;
  /** The phone's direct path opened (the URL it dialed) or closed (undefined). */
  direct?: (url: string | undefined) => void;
};

/** A socket the other side opened to this one: the Mac's direct socket, as its server hands it. */
export type AcceptedSocket = { send: (data: string) => void; close: () => void };

/** At most this many boxes wait for the socket; older ones are dropped first. */
const QUEUE_MAX = 200;

/**
 * Seqs rise with the clock (microseconds, kept above the last), so a side need not save each send
 * to keep its seq rising across restarts. ponytail: a clock set back stalls that side's boxes
 * until it passes the last seq again; save sentSeq on each send if that ever matters.
 */
const nextSeq = (last: number, now: Date) => Math.max(last + 1, now.getTime() * 1000);

const socketUrl = (broker: string, pairingId: string) =>
  `${broker.replace(/^http/, 'ws')}/pairings/${encodeURIComponent(pairingId)}/socket`;

export function mailbox(
  deps: { connect: ConnectSocket; now: () => Date },
  end: MailboxEnd,
  on: MailboxEvents,
) {
  type Socket = ReturnType<ConnectSocket>;
  let socket: Socket | undefined;
  let ready = false;
  // The direct path, once its sealed hello opened: dialed by the phone, which then always sends
  // on it, or accepted by the Mac, which answers on it while the phone last spoke there.
  let direct: { socket: Socket; dialed: boolean } | undefined;
  // The phone's dials still racing; while `holding`, its sends wait for them (the head start).
  let dialing: Socket[] = [];
  let holding = false;
  let spoke: 'relay' | 'direct' = 'relay';
  let { sentSeq } = end;
  const seqs = takenSeqs(end.takenSeq);
  const waiting: string[] = [];
  const joiner = partJoiner(PART_TIMEOUT_MS);

  const frame = (fields: object) => JSON.stringify(fields);
  /** Where a box goes now, or undefined while it must wait. */
  const route = (): ((box: string) => void) | undefined => {
    const way = direct;
    if (way && (way.dialed || spoke === 'direct'))
      return (box) =>
        way.socket.send(frame(way.dialed ? { t: 'send', box } : { t: 'msg', id: 0, box }));
    if (dialing.length && holding) return undefined;
    const relay = socket;
    if (ready && relay) return (box) => relay.send(frame({ t: 'send', box }));
    return undefined;
  };
  const flush = () => {
    const to = route();
    if (to) for (const box of waiting.splice(0)) to(box);
  };
  const deliver = (box: string) => {
    waiting.push(box);
    if (waiting.length > QUEUE_MAX) waiting.shift();
    flush();
  };
  const seal = (message: PhoneMessage) => {
    const now = deps.now();
    sentSeq = nextSeq(sentSeq, now);
    return sealMessage(end.keys, sentSeq, now, message);
  };
  /**
   * Opens a box, noting that the other side spoke `from` there (a hello's caller notes it once the
   * hello checks): the whole message once its parts are in, else undefined.
   */
  const take = (box: string, from?: 'relay' | 'direct'): PhoneMessage | undefined => {
    const opened = openMessage(end.keys, box, seqs.floor());
    const last = seqs.last();
    if (typeof opened === 'string' || !seqs.take(opened.seq)) return undefined;
    if (seqs.last() !== last) on.taken?.(seqs.last());
    if (from) spoke = from;
    const { message } = opened;
    if (message.kind !== 'part') return message;
    const json = joiner.add(message, deps.now().getTime());
    if (json === undefined) return undefined;
    try {
      const whole = phoneMessage.safeParse(JSON.parse(json));
      return whole.success && whole.data.kind !== 'part' ? whole.data : undefined;
    } catch {
      return undefined;
    }
  };
  // No timer: a payload missing a part is dropped on the next frame in or message out, which an
  // open screen's polling makes come within seconds.
  const expire = () => {
    for (const id of joiner.expire(deps.now().getTime())) on.lost?.(id);
  };
  const parse = (data: string): { t?: string; id?: number; box?: string } => {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  };
  const takeAndTell = (box: string, from: 'relay' | 'direct') => {
    const message = take(box, from);
    if (message) on.message(message);
  };
  const frameIn = (data: string) => {
    const got = parse(data);
    if (got.t === 'ready') {
      ready = true;
      flush();
      on.ready?.();
    }
    if (got.t === 'msg' && typeof got.box === 'string' && typeof got.id === 'number') {
      takeAndTell(got.box, 'relay');
      socket?.send(frame({ t: 'ack', upTo: got.id }));
    }
    expire();
  };
  const directGone = (gone: Socket) => {
    if (direct?.socket !== gone) return;
    const dialed = direct.dialed;
    direct = undefined;
    if (dialed) on.direct?.(undefined);
    flush();
  };

  return {
    /** Opens the socket to the broker and authenticates, unless one is open already. */
    connect() {
      if (socket) return;
      // Events of a socket this side already let go of (close) are ignored, so a connect right
      // after a close gets a socket of its own rather than waiting on the old one's close.
      const mine = deps.connect(socketUrl(end.broker, end.pairingId), {
        open: () => socket === mine && mine.send(frame({ t: 'auth', token: end.token })),
        message: (data) => socket === mine && frameIn(data),
        close: () => {
          if (socket !== mine) return;
          socket = undefined;
          ready = false;
          on.closed?.();
        },
      });
      socket = mine;
    },
    /** Lets the broker's socket go at once (not the direct path); `closed` is for a close this side did not ask for. */
    close() {
      const old = socket;
      socket = undefined;
      ready = false;
      old?.close();
    },
    /**
     * The phone dials the Mac's socket at each URL; the first to open carries a sealed hello and,
     * once the Mac answers ready, takes every send. With `hold`, sends wait meanwhile, until
     * `undial`; without, they go by the broker until then.
     */
    dial(urls: string[], hold: boolean) {
      if (direct || dialing.length) return;
      holding = hold;
      for (const url of urls) {
        const mine: Socket = deps.connect(url, {
          open: () => {
            if (!dialing.includes(mine)) return;
            for (const other of dialing) if (other !== mine) other.close();
            dialing = [mine];
            mine.send(frame({ t: 'auth', box: seal({ kind: 'direct' }) }));
          },
          message: (data) => {
            const got = parse(data);
            if (got.t === 'ready' && dialing.length === 1 && dialing[0] === mine) {
              dialing = [];
              direct = { socket: mine, dialed: true };
              on.direct?.(url);
              flush();
            }
            if (got.t === 'msg' && direct?.socket === mine && typeof got.box === 'string')
              takeAndTell(got.box, 'direct');
            expire();
          },
          close: () => {
            if (dialing.includes(mine)) {
              dialing = dialing.filter((other) => other !== mine);
              if (!dialing.length) flush();
            } else directGone(mine);
          },
        });
        dialing.push(mine);
      }
    },
    /** Lets the direct path and any dial go: sends go by the broker. */
    undial() {
      const old = [...dialing, ...(direct ? [direct.socket] : [])];
      dialing = [];
      if (direct) directGone(direct.socket);
      for (const gone of old) gone.close();
      flush();
    },
    /**
     * The Mac takes a socket the phone opened to its own: its first frame must be a sealed hello
     * that opens with this pairing's keys and a fresh seq, or the socket is closed, so a stranger
     * on the network gets nothing. Feed it the socket's frames and its close.
     */
    accept(peer: AcceptedSocket) {
      const self = { socket: peer, dialed: false };
      return {
        message: (data: string) => {
          const got = parse(data);
          if (direct !== self) {
            const hello =
              got.t === 'auth' && typeof got.box === 'string' ? take(got.box) : undefined;
            if (hello?.kind !== 'direct') return peer.close();
            spoke = 'direct';
            const old = direct;
            direct = self;
            old?.socket.close();
            peer.send(frame({ t: 'ready' }));
            flush();
            on.message(hello);
          } else if (got.t === 'send' && typeof got.box === 'string')
            takeAndTell(got.box, 'direct');
          expire();
        },
        close: () => directGone(peer),
      };
    },
    /** Seals a message for the other side, in parts when it does not fit one box. */
    send(message: PhoneMessage) {
      expire();
      const json = JSON.stringify(message);
      const id = 'id' in message ? message.id : `s${nextSeq(sentSeq, deps.now())}`;
      const pieces = fitsOneBox(json) ? [message] : splitParts(id, json);
      for (const piece of pieces) deliver(seal(piece));
    },
  };
}

export type Mailbox = ReturnType<typeof mailbox>;
