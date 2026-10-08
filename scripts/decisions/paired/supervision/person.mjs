// The simulated person of Board placement's paired workflows (#677), and one run under them. The
// person acts only on what the Board says: every 2 s they look at the session's row, approve it
// when it is waiting on a permission, give the task's fixed answer when it is waiting on a
// question, once per wait (again if the Board still shows that wait 20 s later), and do nothing
// otherwise. As the app does, a row the Board wants placed gets a placing call beside the looks,
// one at a time, never awaited by them. What the agent's screen really shows is read apart, only to
// measure: each stretch where the agent stopped with its task unsolved is a waiting episode,
// noticed at the first look whose Board row shows it waiting.

export const POLL_MS = 2_000;
export const REACT_MS = 20_000;
const WAITING = new Set(['waiting-permission', 'waiting-question']);

/**
 * What the person does at `atMs` on a look whose row shows `state`, given their last act (`last`,
 * kept while the Board shows a wait): `approve`, `answer`, or nothing.
 */
export function personAction(state, last, atMs) {
  if (!WAITING.has(state)) return undefined;
  if (last?.state === state && atMs - last.atMs < REACT_MS) return undefined;
  return state === 'waiting-permission' ? 'approve' : 'answer';
}

/**
 * One supervised run, until its task is solved, its agent exits or `budgetMs` is spent:
 * - `look()`: the session's Board row, `{state, pending}` (pending: it wants placing);
 * - `place()`: the placing call;
 * - `truth()`: what its screen shows, `{screen, stopped, solved, dead}`;
 * - `act(action)`: the person approves or answers;
 * - `clock`: `now()` in ms and `sleep(ms)`.
 * Records success, the wall time (to the solving look, else the end), each waiting episode with
 * the Board states seen in it and when it was noticed, the person's acts (and whether the agent
 * had really stopped), and the looks made.
 */
export async function superviseRun({ budgetMs, look, place, truth, act, clock, pollMs = POLL_MS }) {
  const start = clock.now();
  const at = () => clock.now() - start;
  const episodes = [];
  const acts = [];
  let episode;
  let last;
  let placing;
  let looks = 0;
  let success = false;
  let ended;
  const close = (t) => {
    episode.endMs = t;
    // A stop seen on one look only, unseen by the Board and the person, was the screen between
    // two steps, not a wait.
    if (episode.looks === 1 && episode.noticedMs === null && !episode.acted) episodes.pop();
    episode = undefined;
  };
  while (at() < budgetMs) {
    const began = clock.now();
    const row = await look();
    looks++;
    if (row?.pending && !placing)
      placing = place().finally(() => {
        placing = undefined;
      });
    const seen = await truth();
    const t = at();
    if (seen.solved) {
      success = true;
      break;
    }
    if (seen.dead) {
      ended = 'the agent exited';
      break;
    }
    if (seen.stopped && !episode) {
      episode = { startMs: t, screen: seen.screen, board: [], looks: 0, noticedMs: null };
      episodes.push(episode);
    } else if (!seen.stopped && episode) close(t);
    const state = row?.state;
    if (episode) {
      episode.looks++;
      if (!episode.board.includes(state)) episode.board.push(state);
      if (WAITING.has(state) && episode.noticedMs === null) episode.noticedMs = t;
    }
    const action = personAction(state, last, t);
    if (action) {
      await act(action);
      last = { state, atMs: t };
      acts.push({ atMs: t, state, action, agentStopped: Boolean(seen.stopped) });
      if (episode) episode.acted = true;
    } else if (!WAITING.has(state)) last = undefined;
    await clock.sleep(Math.max(0, pollMs - (clock.now() - began)));
  }
  const wallMs = at();
  if (episode) close(wallMs);
  await placing;
  return {
    success,
    wallMs,
    ...(ended ? { ended } : {}),
    episodes: episodes.map(({ looks: _, acted: __, ...e }) => ({
      ...e,
      timeToNoticeMs: e.noticedMs === null ? null : e.noticedMs - e.startMs,
    })),
    acts,
    looks,
  };
}
