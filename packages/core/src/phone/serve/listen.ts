import type { Clock } from '../../lib/clock.js';
import { type AsyncLockDeps, withLock } from '../../lib/lock-file.js';
import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import { type MacPairing, type MacPairingStore, macKeys } from '../mac-pairing.js';
import { isGone } from '../pair.js';
import type { PairingClient } from '../protocol/client.js';
import type { PhoneMessage } from '../protocol/envelope.js';
import { type ConnectSocket, mailbox } from '../protocol/mailbox.js';
import { type PhoneRow, WATCH_MS } from '../protocol/rpc.js';
import { type AnswerDeps, answerCall } from './answer.js';
import { deliverQueued } from './deliver.js';
import { keptDiffs } from './kept-diffs.js';
import { askedRows, phoneRows, rowChanges } from './rows.js';

export type ServeDeps = {
  store: MacPairingStore;
  client: (broker: string) => PairingClient;
  connect: ConnectSocket;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  answers: AnswerDeps;
  lock: AsyncLockDeps;
  /** The lock file that keeps one listener per profile. */
  lockPath: string;
};

export type ServeEnd = { pairingId?: string; ended: 'not-paired' | 'unpaired' | 'stopped' };

/** How often the listener looks at the board for a watching phone: a change reaches it within 5 s. */
const TICK_MS = 2000;
/** The longest wait between tries to reach the broker. */
const BACKOFF_MS = 60_000;
/**
 * ponytail: a socket can die without a close (a dropped Wi-Fi), so the listener dials again every
 * 5 minutes, and at once after the Mac wakes; the broker's frames have no ping, add one if a
 * dropped network's gap matters.
 */
const REDIAL_MS = 5 * 60_000;
/** A gap between ticks this long means the Mac slept. */
const WOKE_MS = 30_000;

/**
 * The Mac's listener (`mesa phone serve`, ADR-0027): holds the Pairing's socket, answers each
 * request through core (answerCall), and while a phone watches (a `sessions` request in the last
 * WATCH_MS) sends the rows that changed. One runs per profile (the lock); it ends when `stop`
 * aborts, or when the broker no longer holds the pairing, which it then forgets here too.
 */
export async function servePhone(deps: ServeDeps, stop?: AbortSignal): Promise<ServeEnd> {
  const pairing = await deps.store.read();
  if (!pairing?.phoneKey) return { ended: 'not-paired' };
  const paired = { ...pairing, phoneKey: pairing.phoneKey };
  return withLock(
    deps.lock,
    deps.lockPath,
    () => listen(deps, paired, stop),
    () => new MesaError('locked', 'a phone listener already runs for this profile'),
    0,
  );
}

async function listen(
  deps: ServeDeps,
  pairing: MacPairing & { phoneKey: string },
  stop?: AbortSignal,
): Promise<ServeEnd> {
  const { pairingId } = pairing;
  const now = () => deps.clock().getTime();
  let watchUntil = 0;
  let listed: PhoneRow[] | undefined;
  let open = false;
  let dialedAt = 0;
  let misses = 0;
  let saving = Promise.resolve();

  const keepTaken = (seq: number) => {
    saving = saving.then(async () => {
      const kept = await deps.store.read();
      if (kept?.pairingId === pairingId && kept.takenSeq < seq)
        await deps.store.write({ ...kept, takenSeq: seq });
    });
  };
  // A board look in flight is shared by every call and the tick that come while it runs: a look
  // takes a second or two, and each running its own made answers take three times that.
  let looking: Promise<SessionRow[]> | undefined;
  const board = () => {
    looking ??= deps.answers.board().finally(() => {
      looking = undefined;
    });
    return looking;
  };
  const diff = keptDiffs(deps.answers.changes.diff, now);
  const answers = { ...deps.answers, board, changes: { ...deps.answers.changes, diff } };
  const respond = async (request: Extract<PhoneMessage, { kind: 'request' }>) => {
    try {
      const result = await answerCall(answers, request.call);
      box.send({ kind: 'response', id: request.id, result });
      if (request.call.method === 'sessions') {
        watchUntil = now() + WATCH_MS;
        listed = (result as { rows: PhoneRow[] }).rows;
      }
    } catch (error) {
      box.send({
        kind: 'response',
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const box = mailbox(
    { connect: deps.connect, now: deps.clock },
    {
      broker: pairing.broker,
      pairingId,
      token: pairing.macToken,
      keys: macKeys(pairing),
      sentSeq: pairing.sentSeq,
      takenSeq: pairing.takenSeq,
    },
    {
      message: (message) => {
        if (message.kind === 'request') void respond(message);
      },
      ready: () => {
        open = true;
        misses = 0;
      },
      closed: () => {
        if (!open) misses += 1;
        open = false;
      },
      taken: keepTaken,
    },
  );
  /** Whether the broker still holds the pairing; one it lost is forgotten here. */
  const stillPaired = () =>
    deps
      .client(pairing.broker)
      .state(pairingId, pairing.macToken)
      .then(
        () => true,
        async (error) => {
          if (!isGone(error)) return true;
          await deps.store.remove();
          return false;
        },
      );
  const watch = async () => {
    if (!listed || now() > watchUntil) return;
    const rows = await askedRows(phoneRows(await board()), deps.answers.prompt);
    const changes = rowChanges(listed, rows);
    listed = rows;
    if (changes) box.send({ kind: 'update', ...changes });
  };
  /** Types the queued replies whose sessions' turns have ended, with the app open or closed. */
  const deliver = async () => {
    const { queue, send } = deps.answers.steer;
    if (!queue.all().length) return;
    await deliverQueued(queue, phoneRows(await board()), send);
  };

  let tickAt = now();
  try {
    while (!stop?.aborted) {
      if (misses && !(await stillPaired())) return { pairingId, ended: 'unpaired' };
      // A tick that comes far later than TICK_MS means the Mac slept, which can kill a socket
      // with no close: dial again now rather than at the next REDIAL_MS.
      const slept = now() - tickAt > WOKE_MS;
      tickAt = now();
      if (open && (slept || now() - dialedAt > REDIAL_MS)) {
        box.close();
        open = false;
      }
      if (!open) {
        dialedAt = now();
        box.connect();
      }
      await watch().catch(() => undefined);
      await deliver().catch(() => undefined);
      await deps.sleep(misses ? Math.min(TICK_MS * 2 ** misses, BACKOFF_MS) : TICK_MS);
    }
    return { pairingId, ended: 'stopped' };
  } finally {
    box.close();
    await saving;
  }
}
