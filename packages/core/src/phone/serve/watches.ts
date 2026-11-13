import {
  type CallResult,
  type PhoneDetail,
  WATCH_MS,
  type WatchCall,
  type WatchedSession,
} from '../protocol/rpc.js';
import { answerCall, type ListenerAnswers } from './answer.js';

/** A change comes in a burst of writes (a hook, then its transcript): one read for each burst. */
const DEBOUNCE_MS = 200;
/**
 * The least time between two pushes of one session, so a busy terminal sends two a second, and a
 * change still goes out within a second of the last push.
 */
const PUSH_GAP_MS = 500;
/** How long a stream gathers what a window prints before it goes out, as orca's coalescer. */
const STREAM_MS = 50;

type Watch = {
  until: number;
  replies?: number;
  /** What was pushed last, as JSON, so only what changed goes out again. */
  sent: { detail?: string; output?: string };
  pushedAt: number;
  /** A push is waiting or reading; `again` asks for one more after it. */
  pending: boolean;
  again: boolean;
  /** A plain terminal, known from its first read: only its output log's changes push it. */
  terminal?: boolean;
  /** The watch asked for the window's stream (the watch call's `stream`). */
  stream?: boolean;
  /** How far into the output log the stream has gone; unknown until a look or the phone's screen. */
  at?: number;
  /** A look at the stream is waiting. */
  streaming: boolean;
  /** Stops watching its output log, while the watch takes the stream. */
  unfollow?: () => void;
  /** Stops watching its agent's transcript, which says what it is doing now (#1153). */
  unwatchTranscript?: () => void;
};

/**
 * Session `id` as a watch pushes it: its detail, and a plain terminal's output lines unless the
 * watch takes its stream (`stream`).
 */
export async function readWatched(
  answers: ListenerAnswers,
  id: string,
  replies?: number,
  stream = false,
): Promise<WatchedSession> {
  const detail = (await answerCall(answers, { method: 'session', id, replies })) as PhoneDetail;
  if (!detail.row.terminal || stream) return { id, detail };
  const output = (await answerCall(answers, { method: 'output', id })) as { lines: string[] };
  return { id, detail, output: output.lines };
}

/**
 * The sessions a phone watches (the `watch` call, #1128) and the pushes that keep it current:
 * `changed` says a session's files changed (or every watched one's, with no id), as does a write to
 * its agent's transcript (`transcript`), and its detail
 * is read again (`read`) and sent (`send`) when it differs from the last one pushed, at most once
 * every PUSH_GAP_MS per session. `logged` says an output log changed (a stream's own log is watched
 * through `follow` while it is taken), which pushes only a terminal, or
 * what any session's window printed to a watch that takes its stream (`since`), STREAM_MS after
 * the change. A watch not asked again within WATCH_MS lapses.
 */
export function sessionWatches(deps: {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  read: (id: string, replies?: number, stream?: boolean) => Promise<WatchedSession>;
  since: (id: string, from?: number) => NonNullable<WatchedSession['stream']>;
  /**
   * Watches session `id`'s output log, calling `changed` on each write; returns the stop, or
   * none when it cannot yet (no log), and the next ask of the watch tries again.
   */
  follow: (id: string, changed: () => void) => (() => void) | undefined;
  /**
   * Watches session `id`'s agent transcript, calling `changed` on each write; returns the stop, or
   * none when it has none yet, and the next ask of the watch tries again. A tool call starts with
   * no hook, so its transcript line is what pushes the step the agent is on (#1153).
   */
  transcript: (id: string, changed: () => void) => (() => void) | undefined;
  send: (watched: WatchedSession) => void;
}) {
  const watches = new Map<string, Watch>();
  const end = (id: string) => {
    watches.get(id)?.unfollow?.();
    watches.get(id)?.unwatchTranscript?.();
    watches.delete(id);
  };
  const live = (id: string) => {
    const watch = watches.get(id);
    if (watch && watch.until < deps.now()) end(id);
    return watches.get(id);
  };
  const push = async (id: string, watch: Watch) => {
    const next = await deps.read(id, watch.replies, watch.stream).catch(() => undefined);
    watch.pushedAt = deps.now();
    if (!next || live(id) !== watch) return;
    watch.terminal = next.output !== undefined;
    const detail = next.detail && JSON.stringify(next.detail);
    const output = next.output && JSON.stringify(next.output);
    const changed: WatchedSession = { id };
    if (detail !== watch.sent.detail) changed.detail = next.detail;
    if (output !== watch.sent.output) changed.output = next.output;
    watch.sent = { detail, output };
    if (changed.detail || changed.output) deps.send(changed);
  };
  const schedule = (id: string) => {
    const watch = live(id);
    if (!watch) return;
    if (watch.pending) {
      watch.again = true;
      return;
    }
    watch.pending = true;
    void deps
      .sleep(Math.max(DEBOUNCE_MS, watch.pushedAt + PUSH_GAP_MS - deps.now()))
      .then(() => push(id, watch))
      .finally(() => {
        watch.pending = false;
        if (!watch.again) return;
        watch.again = false;
        schedule(id);
      });
  };
  const stream = (id: string, watch: Watch) => {
    if (watch.streaming) return;
    watch.streaming = true;
    void deps.sleep(STREAM_MS).then(() => {
      watch.streaming = false;
      if (live(id) !== watch) return;
      const sent = watch.at;
      // A log read that fails (cut as it is read) waits for the next write.
      const next = (() => {
        try {
          return deps.since(id, sent);
        } catch {
          return undefined;
        }
      })();
      if (!next) return;
      watch.at = next.to;
      if (sent !== undefined && next.to !== sent) deps.send({ id, stream: next });
    });
  };
  /**
   * Session `id`'s output log changed: a watch that takes its stream gets what it printed, and
   * otherwise a terminal's output is pushed while an agent's waits.
   */
  const logged = (id: string) => {
    const watch = live(id);
    if (watch?.stream) stream(id, watch);
    else if (watch?.terminal !== false) schedule(id);
  };
  return {
    /** Answers `watch` (subscribe, or ask again before it lapses) and `unwatch`. */
    answer(call: WatchCall): CallResult<'watch' | 'unwatch'> {
      if (call.method === 'unwatch') end(call.id);
      else {
        const watch = live(call.id);
        const until = deps.now() + WATCH_MS;
        // A watch asked without `replies` or `stream` keeps what an earlier ask set: the session
        // screen asks for replies, its output terminal for the stream (#1146).
        if (watch)
          Object.assign(watch, {
            until,
            replies: call.replies ?? watch.replies,
            stream: call.stream ?? watch.stream,
          });
        else
          watches.set(call.id, {
            until,
            replies: call.replies,
            stream: call.stream,
            streaming: false,
            sent: {},
            pushedAt: 0,
            pending: false,
            again: false,
          });
        const kept = watches.get(call.id);
        if (kept && !kept.unwatchTranscript)
          kept.unwatchTranscript = deps.transcript(call.id, () => schedule(call.id));
        if (kept?.stream && !kept.unfollow)
          kept.unfollow = deps.follow(call.id, () => logged(call.id));
        if (!kept?.stream && kept?.unfollow) {
          kept.unfollow();
          kept.unfollow = undefined;
        }
      }
      return {};
    },
    /** Whether a phone watches any session now. */
    any: () => [...watches.keys()].some(live),
    /** Session `id`'s files changed, or any watched one's when no id is given. */
    changed(id?: string) {
      for (const each of id === undefined ? [...watches.keys()] : [id]) schedule(each);
    },
    /** Session `id`'s output log changed: what it printed goes to a stream, or a terminal's lines. */
    logged,
    /** Ends every watch and stops watching their logs, as the listener stops. */
    close: () => {
      for (const id of [...watches.keys()]) end(id);
    },
    /** The phone read session `id`'s screen up to byte `at` of its log: its stream goes on from there. */
    seek(id: string, at: number) {
      const watch = live(id);
      if (watch) watch.at = at;
    },
  };
}
