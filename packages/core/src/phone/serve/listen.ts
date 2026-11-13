import type { Clock } from '../../lib/clock.js';
import { type AsyncLockDeps, withLock } from '../../lib/lock-file.js';
import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../../sessions/board/rows.js';
import { type MacPairing, type MacPairingStore, macKeys } from '../mac-pairing.js';
import { isGone } from '../pair.js';
import type { PairingClient } from '../protocol/client.js';
import type { PhoneMessage } from '../protocol/envelope.js';
import { type ConnectSocket, mailbox } from '../protocol/mailbox.js';
import {
  type CallResult,
  isWatchCall,
  type PhoneCall,
  type PhoneRow,
  WATCH_MS,
} from '../protocol/rpc.js';
import { type AnswerDeps, answerCall, boardRows, type ListenerAnswers } from './answer.js';
import { deliverQueued } from './deliver.js';
import type { DirectListen, DirectServer } from './direct-socket.js';
import { keptDiffs } from './kept-diffs.js';
import { watchRowFiles } from './row-files.js';
import { keptAsks, phoneRows, rowChanges } from './rows.js';
import { readWatched, sessionWatches } from './watches.js';

export type ServeDeps = {
  store: MacPairingStore;
  client: (broker: string) => PairingClient;
  connect: ConnectSocket;
  /** The Mac's own socket, which a phone on the same network or tailnet dials (#1129). */
  direct?: DirectListen;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  answers: AnswerDeps;
  lock: AsyncLockDeps;
  /** The lock file that keeps one listener per profile. */
  lockPath: string;
  /** Marks this process as the profile's listener once it holds the lock (its version, #1133). */
  markRunning: () => void;
  /** The files a phone row is read from, which the listener watches (watchRowFiles). */
  rowFiles: Parameters<typeof watchRowFiles>[0];
};

export type ServeEnd = { pairingId?: string; ended: 'not-paired' | 'unpaired' | 'stopped' };

/**
 * How long a look stays good with no change seen, which is also how often a watching phone gets a
 * look when nothing changes (a change the watch cannot see: a pane that died with no hook).
 */
const FALLBACK_MS = 15_000;
/** Changes come in bursts (a tool call's PostToolUse, then the next PreToolUse): one look for each. */
const DEBOUNCE_MS = 200;
/**
 * The least time between two looks the loop starts, so working agents' hooks give one look in that
 * long; a change still reaches a watching phone within about 5 s (the gap, the debounce, the look).
 */
const GAP_MS = 2500;
/** How long one wait of a rest lasts: a change or the stop ends the rest within it. */
const WAIT_MS = 250;
/** The first wait before dialing the broker again, doubled at each miss. */
const RETRY_MS = 2000;
/** The longest wait between tries to reach the broker. */
const BACKOFF_MS = 60_000;
/**
 * ponytail: a socket can die without a close (a dropped Wi-Fi), so the listener dials again every
 * 5 minutes, and at once after the Mac wakes; the broker's frames have no ping, add one if a
 * dropped network's gap matters.
 */
const REDIAL_MS = 5 * 60_000;
/** A wait that ran this much longer than asked means the Mac slept. */
const WOKE_MS = 30_000;
/** The calls that only read the board; any other may change a row, so the next read looks again. */
const READS: ReadonlySet<PhoneCall['method']> = new Set([
  'sessions',
  'session',
  'usage',
  'prompt',
  'watch',
  'unwatch',
]);

/**
 * The Mac's listener (`mesa phone serve`, ADR-0027): holds the Pairing's socket, answers each
 * request through core (answerCall), and while a phone watches (a `sessions` request in the last
 * WATCH_MS) sends the rows that changed, and each session it watches (sessionWatches). It looks
 * at the board only when a file a row is read from changed (`watch`), or every FALLBACK_MS, one
 * look at a time, and answers calls from the last look meanwhile. One runs per profile (the lock); it ends when `stop` aborts, or when the broker no
 * longer holds the pairing, which it then forgets here too.
 */
export async function servePhone(deps: ServeDeps, stop?: AbortSignal): Promise<ServeEnd> {
  const pairing = await deps.store.read();
  if (!pairing?.phoneKey) return { ended: 'not-paired' };
  const paired = { ...pairing, phoneKey: pairing.phoneKey };
  return withLock(
    deps.lock,
    deps.lockPath,
    () => {
      deps.markRunning();
      return listen(deps, paired, stop);
    },
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
  // A board look in flight is shared by every call and the loop that come while it runs: a look
  // takes a second or two, and each running its own made answers take three times that. Its rows
  // answer until a change is seen (`stale`) or FALLBACK_MS passed.
  let looking: Promise<SessionRow[]> | undefined;
  let looked: { at: number; rows: Promise<SessionRow[]> } | undefined;
  let stale = true;
  const board = () => {
    if (looking) return looking;
    if (!stale && looked && now() - looked.at < FALLBACK_MS) return looked.rows;
    stale = false;
    const at = now();
    const look = deps.answers.board();
    look.then(
      () => {
        looked = { at, rows: look };
      },
      () => {
        stale = true;
      },
    );
    looking = look.finally(() => {
      looking = undefined;
    });
    return looking;
  };
  const diff = keptDiffs(deps.answers.changes.diff, now);
  // A PR's patch is kept the same way, keyed by its project and number.
  const prPatch = keptDiffs(
    (pr: { project: string; number: number }) => deps.answers.prs.diff(pr.project, pr.number),
    now,
    (pr) => `${pr.project}#${pr.number}`,
  );
  // A prompt not drawn yet when its hook came is read again at the next look, which comes soon.
  const asks = keptAsks(deps.answers.prompt, () => {
    stale = true;
    heard += 1;
  });
  const answers: ListenerAnswers = {
    ...deps.answers,
    board,
    asked: asks.read,
    changes: { ...deps.answers.changes, diff },
    prs: {
      ...deps.answers.prs,
      diff: (project: string, number: number, reuse?: boolean) =>
        prPatch({ project, number }, reuse),
    },
  };
  // A watched session is read with the last look's rows: its replies and output are new now, and
  // a row it changed is pushed again after the next look.
  const watches = sessionWatches({
    now,
    sleep: deps.sleep,
    read: (id, replies, stream) =>
      readWatched({ ...answers, board: () => looked?.rows ?? board() }, id, replies, stream),
    since: answers.since,
    send: (watched) =>
      box.send({ kind: 'update', rows: [], gone: [], order: [], watched: [watched] }),
  });
  const respond = async (request: Extract<PhoneMessage, { kind: 'request' }>) => {
    try {
      const { call } = request;
      const result = isWatchCall(call) ? watches.answer(call) : await answerCall(answers, call);
      if (call.method === 'screen') watches.seek(call.id, (result as CallResult<'screen'>).at);
      if (!READS.has(request.call.method)) stale = true;
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
        // The phone asks where the direct socket is; the answer goes back the way it asked.
        if (message.kind === 'direct')
          box.send({
            kind: 'direct',
            ...(direct ? { port: direct.port, hosts: direct.hosts() } : {}),
          });
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
          await deps.store.forget(pairingId);
          return false;
        },
      );
  // ponytail: a direct socket that fails to start leaves the phone on the relay, unretried until
  // the listener restarts.
  const direct: DirectServer | undefined = await deps.direct?.(box.accept).catch(() => undefined);
  const watch = async () => {
    if (!listed || now() > watchUntil) return;
    const rows = await boardRows(answers);
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

  // The loop rests in short waits, so a change (`heard` moved past `seen`) or the stop ends a
  // rest within one of them, and no wait outlives the listener.
  let heard = 0;
  let seen = 0;
  const rest = async (ms: number, onChange: boolean) => {
    for (let waited = 0; waited < ms; waited += WAIT_MS) {
      if (stop?.aborted || (onChange && heard !== seen)) return;
      await deps.sleep(WAIT_MS);
    }
  };
  const unwatch = watchRowFiles(deps.rowFiles, ({ hooked, logged }) => {
    // An output log is no row's: it pushes a watched terminal, never a look at the board.
    if (logged) return watches.logged(logged);
    watches.changed(hooked);
    if (hooked) asks.forget(hooked);
    stale = true;
    heard += 1;
  });

  let slept = false;
  try {
    while (!stop?.aborted) {
      if (misses && !(await stillPaired())) return { pairingId, ended: 'unpaired' };
      if (open && (slept || now() - dialedAt > REDIAL_MS)) {
        box.close();
        open = false;
      }
      if (!open) {
        dialedAt = now();
        box.connect();
      }
      seen = heard;
      await watch().catch(() => undefined);
      // A look first, so a watched session's row is pushed as the board has it now.
      if (watches.any()) await board().catch(() => undefined);
      watches.changed();
      await deliver().catch(() => undefined);
      // Only the rest is timed, never the look: a look slowed by a loaded Mac is not a Mac that
      // slept, which can kill a socket with no close, so it dials again now, not at REDIAL_MS.
      const restAt = now();
      const longest = misses ? Math.min(RETRY_MS * 2 ** misses, BACKOFF_MS) : FALLBACK_MS;
      if (misses) await rest(longest, false);
      else {
        await rest(GAP_MS, false);
        await rest(FALLBACK_MS - GAP_MS, true);
        if (heard !== seen) await rest(DEBOUNCE_MS, false);
      }
      slept = now() - restAt > longest + DEBOUNCE_MS + WOKE_MS;
    }
    return { pairingId, ended: 'stopped' };
  } finally {
    unwatch();
    direct?.close();
    box.close();
    await saving;
  }
}
