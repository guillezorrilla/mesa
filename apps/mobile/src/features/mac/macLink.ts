import {
  macCalls,
  mailbox,
  type PhonePairing,
  pairingClient,
  phoneKeys,
  type UpdateMessage,
  webSocketConnect,
} from '@mesa/core/phone';
import { randomUUID } from 'expo-crypto';

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** How long after a dropped socket the app dials again, while it is in front. */
const REDIAL_MS = 3000;

/**
 * The phone's line to the Mac (ADR-0027): the Pairing's mailbox over the broker's socket, calls
 * that wait for their answers, the updates the Mac pushes, and when the Mac was last heard.
 * `keepTaken` saves the last seq taken, so a box the broker replays is refused after a restart.
 */
export function macLink(pairing: PhonePairing, keepTaken: (takenSeq: number) => void) {
  const updates = new Set<(update: UpdateMessage) => void>();
  let heardAt: number | undefined;
  let wanted = false;
  const box = mailbox(
    { connect: webSocketConnect, now: () => new Date() },
    { ...pairing, token: pairing.phoneToken, keys: phoneKeys(pairing) },
    {
      message: (message) => {
        heardAt = Date.now();
        if (calls.settle(message) || message.kind !== 'update') return;
        for (const listener of updates) listener(message);
      },
      lost: (id) => calls.lost(id),
      closed: () => {
        if (wanted) setTimeout(() => wanted && box.connect(), REDIAL_MS);
      },
      taken: keepTaken,
    },
  );
  const calls = macCalls({ send: (message) => box.send(message), newId: randomUUID, wait });
  const listen = <T>(set: Set<T>, listener: T) => {
    set.add(listener);
    return () => void set.delete(listener);
  };
  return {
    call: calls.call,
    /** Holds the socket open, dialing again after a drop, until `close`. */
    connect: () => {
      wanted = true;
      box.connect();
    },
    close: () => {
      wanted = false;
      box.close();
    },
    /** Each update the Mac pushes; returns the unsubscribe. */
    onUpdate: (listener: (update: UpdateMessage) => void) => listen(updates, listener),
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
