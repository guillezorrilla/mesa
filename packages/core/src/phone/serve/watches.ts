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
};

/** Session `id` as a watch pushes it: its detail, and a plain terminal's output. */
export async function readWatched(
  answers: ListenerAnswers,
  id: string,
  replies?: number,
): Promise<WatchedSession> {
  const detail = (await answerCall(answers, { method: 'session', id, replies })) as PhoneDetail;
  if (!detail.row.terminal) return { id, detail };
  const output = (await answerCall(answers, { method: 'output', id })) as { lines: string[] };
  return { id, detail, output: output.lines };
}

/**
 * The sessions a phone watches (the `watch` call, #1128) and the pushes that keep it current:
 * `changed` says a session's files changed (or every watched one's, with no id), and its detail
 * is read again (`read`) and sent (`send`) when it differs from the last one pushed, at most once
 * every PUSH_GAP_MS per session. `logged` says an output log changed, which pushes only a terminal. A
 * watch not asked again within WATCH_MS lapses.
 */
export function sessionWatches(deps: {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  read: (id: string, replies?: number) => Promise<WatchedSession>;
  send: (watched: WatchedSession) => void;
}) {
  const watches = new Map<string, Watch>();
  const live = (id: string) => {
    const watch = watches.get(id);
    if (watch && watch.until < deps.now()) watches.delete(id);
    return watches.get(id);
  };
  const push = async (id: string, watch: Watch) => {
    const next = await deps.read(id, watch.replies).catch(() => undefined);
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
  return {
    /** Answers `watch` (subscribe, or ask again before it lapses) and `unwatch`. */
    answer(call: WatchCall): CallResult<'watch' | 'unwatch'> {
      if (call.method === 'unwatch') watches.delete(call.id);
      else {
        const watch = live(call.id);
        const until = deps.now() + WATCH_MS;
        if (watch) Object.assign(watch, { until, replies: call.replies });
        else
          watches.set(call.id, {
            until,
            replies: call.replies,
            sent: {},
            pushedAt: 0,
            pending: false,
            again: false,
          });
      }
      return {};
    },
    /** Whether a phone watches any session now. */
    any: () => [...watches.keys()].some(live),
    /** Session `id`'s files changed, or any watched one's when no id is given. */
    changed(id?: string) {
      for (const each of id === undefined ? [...watches.keys()] : [id]) schedule(each);
    },
    /** Session `id`'s output log changed: a terminal's output is pushed, an agent's waits. */
    logged(id: string) {
      if (live(id)?.terminal !== false) schedule(id);
    },
  };
}
