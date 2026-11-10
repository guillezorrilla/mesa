import { statSync } from 'node:fs';
import { AGENTS } from '../../agents/agents.js';
import type { MesaContext } from '../../context.js';
import { MesaError } from '../../lib/result.js';
import type { SessionRow } from '../board/rows.js';
import { isOver } from '../record/lifecycle.js';
import type { SessionRecord } from '../record/record.js';
import { BUSY_STATES, type SessionState } from '../record/states.js';
import { eventsLog, type HookEvent, scanHookEvents } from '../signals/hook-events.js';
import { stateEvent } from '../signals/state.js';

/** How often the event logs are read again while a wait lasts. */
const POLL_MS = 1_000;
const DEFAULT_TIMEOUT_S = 1_800;

export type WaitedSession = { id: string; state: SessionState };
export type WaitOptions = { any?: boolean; timeoutSeconds?: number };
/** What `mesa wait` returns: each session's state, and `timeout` when it gave up first. */
export type Waited = { sessions: WaitedSession[]; timeout?: true };

/**
 * Blocking until sessions leave working, for scripts and headless runs that cannot end a turn and
 * be woken (`mesa wait`). `board` is one look at the start; after it, only the sessions' hook
 * event logs and records are read.
 */
export function waitActions(ctx: MesaContext, board: () => Promise<SessionRow[]>) {
  const logSize = (id: string) => {
    try {
      return statSync(eventsLog(ctx.paths.events, id)).size;
    } catch {
      return 0;
    }
  };
  return {
    /**
     * Resolves once every one of `ids` (with `any`, one) is idle, waiting on a person, or over,
     * with each one's state; past `timeoutSeconds` (default 1800), with the states so far and
     * `timeout`. A session's state after the start look is its latest state hook since then
     * (stateEvent), or its record's once it is over (isOver), or, for an agent with no state
     * hooks, once its record changed. An unknown id is not_found.
     */
    wait: async (ids: readonly string[], opts: WaitOptions = {}): Promise<Waited> => {
      const wanted = [...new Set(ids)];
      if (!wanted.length) throw new MesaError('usage', 'name a session to wait for');
      for (const id of wanted) ctx.store.get(id);
      const timeout = opts.timeoutSeconds ?? DEFAULT_TIMEOUT_S;
      if (!Number.isFinite(timeout) || timeout <= 0)
        throw new MesaError('usage', '--timeout takes a number of seconds above 0');
      const start = ctx.clock();
      // Before the look, so an event logged while it runs is read after it.
      const offsets = new Map(wanted.map((id) => [id, logSize(id)]));
      const rows = new Map((await board()).map((row) => [row.id, row]));
      const states = new Map(
        wanted.map((id) => [id, (rows.get(id)?.lastState ?? ctx.store.get(id).lastState).state]),
      );
      const events = new Map<string, HookEvent[]>(wanted.map((id) => [id, []]));
      const stateNow = (record: SessionRecord, was: SessionState): SessionState => {
        if (isOver(record))
          return BUSY_STATES.has(record.lastState.state) ? 'done' : record.lastState.state;
        const { agent } = record;
        const reader = agent === 'terminal' ? undefined : AGENTS[agent];
        if (agent === 'terminal' || !reader?.hookState)
          return record.lastState.at > start.toISOString() ? record.lastState.state : was;
        const seen = events.get(record.id) ?? [];
        offsets.set(
          record.id,
          scanHookEvents(ctx.paths.events, record.id, offsets.get(record.id) ?? 0, (event) =>
            seen.push(event),
          ),
        );
        seen.sort((a, b) => a.at.localeCompare(b.at));
        const latest = stateEvent(agent, seen);
        return (latest && reader.hookState(latest.event, latest.payload)) || was;
      };
      const snapshot = () => wanted.map((id) => ({ id, state: states.get(id) ?? 'working' }));
      const left = (id: string) => !BUSY_STATES.has(states.get(id) ?? 'working');
      const done = () => (opts.any ? wanted.some(left) : wanted.every(left));
      while (!done()) {
        if (ctx.clock().getTime() - start.getTime() >= timeout * 1000)
          return { sessions: snapshot(), timeout: true };
        await ctx.sleep(POLL_MS);
        for (const id of wanted) {
          const record = ctx.store.find(id);
          const was = states.get(id) ?? 'working';
          if (record) states.set(id, stateNow(record, was));
        }
      }
      return { sessions: snapshot() };
    },
  };
}
