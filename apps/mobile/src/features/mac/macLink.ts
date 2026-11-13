import {
  type CallResult,
  type MacPath,
  type PhoneCall,
  type PhonePairing,
  pairingClient,
  phoneKeys,
  phoneLine,
  type UpdateMessage,
  webSocketConnect,
} from '@mesa/core/phone';
import { randomUUID } from 'expo-crypto';
import { againOnTimeout } from './againOnTimeout';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** How long after a dropped socket the app dials again, while it is in front. */
const REDIAL_MS = 3000;

/**
 * The phone's line to the Mac (ADR-0027): the Pairing's mailbox over the broker's socket or the
 * Mac's own (#1129), calls that wait for their answers, the updates the Mac pushes, the path in
 * use, and when the Mac was last heard. `keepTaken` saves the last seq taken, so a box the broker
 * replays is refused after a restart.
 */
export function macLink(pairing: PhonePairing, keepTaken: (takenSeq: number) => void) {
  const updates = new Set<(update: UpdateMessage) => void>();
  const paths = new Set<(path: MacPath) => void>();
  let heardAt: number | undefined;
  let wanted = false;
  const line = phoneLine(
    { connect: webSocketConnect, now: () => new Date(), wait, newId: randomUUID },
    { ...pairing, token: pairing.phoneToken, keys: phoneKeys(pairing) },
    {
      message: (message) => {
        heardAt = Date.now();
        if (message.kind !== 'update') return;
        for (const listener of updates) listener(message);
      },
      path: (path) => {
        for (const listener of paths) listener(path);
      },
      closed: () => {
        if (wanted) setTimeout(() => wanted && line.connect(), REDIAL_MS);
      },
      taken: keepTaken,
    },
  );
  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener);
    return () => void set.delete(listener);
  };
  return {
    call: line.call,
    /** A read (never a write): asked once more when the Mac did not answer in time. */
    read: <M extends PhoneCall['method']>(
      call: Extract<PhoneCall, { method: M }>,
    ): Promise<CallResult<M>> => againOnTimeout(() => line.call(call)),
    /** Holds the socket open, dialing again after a drop, until `close`. */
    connect: () => {
      wanted = true;
      line.connect();
    },
    close: () => {
      wanted = false;
      line.close();
    },
    /** Each update the Mac pushes; returns the unsubscribe. */
    onUpdate: (listener: (update: UpdateMessage) => void) => listen(updates, listener),
    /** The path to the Mac now: the relay, or direct on a LAN or a tailnet. */
    path: line.path,
    /** Each change of path; returns the unsubscribe. */
    onPath: (listener: (path: MacPath) => void) => listen(paths, listener),
    /**
     * When the Mac was last heard: by this app since it opened, or by the broker (the Mac's last
     * check-in), whichever is later; undefined when neither knows.
     */
    lastHeard: async () => {
      const info = await pairingClient(fetch, pairing.broker)
        .state(pairing.pairingId, pairing.phoneToken)
        .catch(() => undefined);
      const broker = info?.macSeenAt ? Date.parse(info.macSeenAt) : undefined;
      return Math.max(heardAt ?? 0, broker ?? 0) || undefined;
    },
  };
}

export type MacLink = ReturnType<typeof macLink>;
