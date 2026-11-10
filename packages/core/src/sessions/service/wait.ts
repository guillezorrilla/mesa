import { AGENTS } from '../../agents/agents.js';
import type { MesaContext } from '../../context.js';
import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../board/rows.js';
import type { SessionState } from '../record/states.js';
import { parentHook, scanHookEvents } from '../signals/hook-events.js';

/** How often the event logs are read again while a wait lasts. */
const POLL_MS = 1_000;
const DEFAULT_TIMEOUT_S = 1_800;

/** States a wait does not end on: the agent is at work, or not started yet. */
const BUSY: ReadonlySet<SessionState> = new Set(['working', 'queued']);

export type WaitedSession = { id: string; state: SessionState };
export type WaitOptions = { any?: boolean; timeoutSeconds?: number };

/**
 * Blocking until sessions leave working, for scripts and headless runs that cannot end a turn and
 * be woken (`mesa wait`). `board` is one look at the start; after it, only the sessions' hook
 * event logs and records are read.
 */
export function waitActions(ctx: MesaContext, board: () => Promise<SessionRow[]>) {
  return {
    /**
     * Resolves once every one of `ids` (with `any`, one) is idle, waiting on a person, or over,
     * with each one's state. Past `timeoutSeconds` (default 1800) a `timeout` error, its details
     * the states so far. An unknown id is not_found.
     */
    wait: async (ids: readonly string[], opts: WaitOptions = {}) => {
      const wanted = [...new Set(ids)];
      if (!wanted.length) throw new MesaError('usage', 'name a session to wait for');
      for (const id of wanted) ctx.store.get(id);
      const timeout = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_S;
      if (!Number.isFinite(timeout) || timeout <= 0)
        throw new MesaError('usage', '--timeout takes a number of seconds above 0');
      const start = ctx.clock().getTime();
      const rows = new Map((await board()).map((row) => [row.id, row]));
      const states = new Map<string, SessionState>();
      const offsets = new Map<string, number>();
      for (const id of wanted) {
        states.set(id, (rows.get(id)?.lastState ?? ctx.store.get(id).lastState).state);
        // From the end of its log now: the look above already read what came before.
        offsets.set(
          id,
          scanHookEvents(ctx.paths.events, id, 0, () => {}),
        );
      }
      const snapshot = () => wanted.map((id) => ({ id, state: states.get(id) as SessionState }));
      const left = (id: string) => !BUSY.has(states.get(id) as SessionState);
      const done = () => (opts.any ? wanted.some(left) : wanted.every(left));
      while (!done()) {
        if (ctx.clock().getTime() - start >= timeout * 1000)
          throw new MesaError(
            'timeout',
            `${wanted.filter((id) => !left(id)).join(', ')} still working after ${timeout} s`,
            { sessions: snapshot() },
          );
        await ctx.sleep(POLL_MS);
        for (const id of wanted) {
          const record = ctx.store.find(id);
          if (!record) continue;
          if (record.endedAt) {
            states.set(id, BUSY.has(record.lastState.state) ? 'done' : record.lastState.state);
            continue;
          }
          const reader = record.agent === 'terminal' ? undefined : AGENTS[record.agent];
          offsets.set(
            id,
            scanHookEvents(ctx.paths.events, id, offsets.get(id) ?? 0, (event) => {
              const state = parentHook(event) && reader?.hookState?.(event.event, event.payload);
              if (state) states.set(id, state);
            }),
          );
        }
      }
      return { sessions: snapshot() };
    },
  };
}
