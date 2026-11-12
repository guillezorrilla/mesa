// One side's end of a Pairing's Mailbox over the broker's WebSocket (ADR-0014's 2026-11-11
// amendment): it authenticates, opens each box the broker hands over, puts parts back together,
// acks, and seals what this side sends, cutting a message over one box into parts. The Mac's
// listener and the phone app both run it; what to do on a close (reconnect, or wait) is theirs.
import { fitsOneBox, PART_TIMEOUT_MS, partJoiner, splitParts } from './chunk.js';
import { openMessage, type PhoneMessage, phoneMessage, sealMessage } from './envelope.js';
import type { SideKeys } from './seal.js';

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
};

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
  let socket: ReturnType<ConnectSocket> | undefined;
  let ready = false;
  let { sentSeq, takenSeq } = end;
  const waiting: string[] = [];
  const joiner = partJoiner(PART_TIMEOUT_MS);

  const sendFrame = (box: string) => JSON.stringify({ t: 'send', box });
  const deliver = (box: string) => {
    if (ready && socket) return socket.send(sendFrame(box));
    waiting.push(box);
    if (waiting.length > QUEUE_MAX) waiting.shift();
  };
  const take = (box: string) => {
    const opened = openMessage(end.keys, box, takenSeq);
    if (typeof opened === 'string') return;
    takenSeq = opened.seq;
    on.taken?.(takenSeq);
    const { message } = opened;
    if (message.kind !== 'part') return on.message(message);
    const json = joiner.add(message, deps.now().getTime());
    if (json === undefined) return;
    let whole: ReturnType<typeof phoneMessage.safeParse>;
    try {
      whole = phoneMessage.safeParse(JSON.parse(json));
    } catch {
      return;
    }
    if (whole.success && whole.data.kind !== 'part') on.message(whole.data);
  };
  // No timer: a payload missing a part is dropped on the next frame in or message out, which an
  // open screen's polling makes come within seconds.
  const expire = () => {
    for (const id of joiner.expire(deps.now().getTime())) on.lost?.(id);
  };
  const frameIn = (data: string) => {
    let frame: { t?: string; id?: number; box?: string };
    try {
      frame = JSON.parse(data);
    } catch {
      return;
    }
    if (frame.t === 'ready') {
      ready = true;
      for (const box of waiting.splice(0)) socket?.send(sendFrame(box));
      on.ready?.();
    }
    if (frame.t === 'msg' && typeof frame.box === 'string' && typeof frame.id === 'number') {
      take(frame.box);
      socket?.send(JSON.stringify({ t: 'ack', upTo: frame.id }));
    }
    expire();
  };

  return {
    /** Opens the socket and authenticates, unless one is open already. */
    connect() {
      if (socket) return;
      // Events of a socket this side already let go of (close) are ignored, so a connect right
      // after a close gets a socket of its own rather than waiting on the old one's close.
      const mine = deps.connect(socketUrl(end.broker, end.pairingId), {
        open: () => socket === mine && mine.send(JSON.stringify({ t: 'auth', token: end.token })),
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
    /** Lets the socket go at once; `closed` is for a close this side did not ask for. */
    close() {
      const old = socket;
      socket = undefined;
      ready = false;
      old?.close();
    },
    /** Seals a message for the other side, in parts when it does not fit one box. */
    send(message: PhoneMessage) {
      expire();
      const json = JSON.stringify(message);
      const id = 'id' in message ? message.id : `s${nextSeq(sentSeq, deps.now())}`;
      const pieces = fitsOneBox(json) ? [message] : splitParts(id, json);
      for (const piece of pieces) {
        const now = deps.now();
        sentSeq = nextSeq(sentSeq, now);
        deliver(sealMessage(end.keys, sentSeq, now, piece));
      }
    },
  };
}
