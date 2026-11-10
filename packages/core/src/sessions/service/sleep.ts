import type { MesaContext } from '../../context.js';
import { type SleepSeen, sleepBlocker, sleepSession } from '../end/sleep.js';
import { projectScope } from '../record/general.js';
import { recordAgent } from '../record/record.js';
import { wakeSession } from '../start/wake.js';
import { targetLabel } from '../tmux/format.js';
import { windowOf } from '../window/window-name.js';
import type { SessionDeps } from './deps.js';

/** Sleeping sessions (CONTEXT.md, Sleeping session): the app's sleep pass, and a wake. */
export function sleepActions(ctx: MesaContext, deps: SessionDeps) {
  const { store, tmux, record } = ctx;
  return {
    /**
     * Puts to sleep every session sleepBlocker lets sleep now, by `sessions.sleepAfterMinutes`,
     * but `shown`, the one the app shows in a focused window; each gets a session receipt. With
     * sleep off it reads nothing. Returns the sessions put to sleep.
     */
    sleepIdle: async ({ shown }: { shown?: string } = {}) => {
      const afterMs = (ctx.configIfAny()?.sessions.sleepAfterMinutes ?? 0) * 60_000;
      if (afterMs <= 0) return [];
      const records = store.readable();
      const running = new Set(
        (await tmux.listWindows()).filter((w) => !w.dead).map((w) => targetLabel(w)),
      );
      const seenOf = (id: string, target: string): SleepSeen => ({
        now: ctx.clock(),
        afterMs,
        ...(shown ? { shown } : {}),
        alive: running.has(target),
        children: store.readable().filter((c) => c.parent === id),
      });
      const slept: string[] = [];
      for (const r of records) {
        const target = targetLabel(windowOf(r));
        if (sleepBlocker(r, seenOf(r.id, target))) continue;
        const done = await record(
          {
            type: 'session',
            summary: () => `Put session ${r.id} to sleep`,
            failure: `Could not put session ${r.id} to sleep`,
            project: () => projectScope(r.project),
            session: () => r.id,
            agent: () => recordAgent(r),
            inputs: { id: r.id, afterMinutes: afterMs / 60_000 },
            outputs: (s) => ({ sleeping: s?.sleeping?.at ?? null }),
            changed: (s) => s !== undefined,
          },
          () =>
            sleepSession(
              { store, tmux, run: ctx.run, clock: ctx.clock, sleep: ctx.sleep },
              r.id,
              // As it is under its lock now: a prompt typed since the look keeps it awake.
              (current) => !sleepBlocker(current, seenOf(current.id, target)),
            ),
        ).catch(() => undefined);
        if (done?.result) slept.push(r.id);
      }
      return slept;
    },
    /** Reopens a sleeping session's conversation in the same session (wakeSession). */
    wake: (id: string) =>
      record(
        {
          type: 'session',
          summary: () => `Woke session ${id}`,
          failure: `Could not wake session ${id}`,
          warning: (r) => r.warning,
          project: (r) => projectScope(r.record.project),
          session: () => id,
          agent: (r) => recordAgent(r.record),
          inputs: { id },
          outputs: (r) => ({ window: r.record.tmux.window }),
        },
        () => wakeSession(deps.openDeps(), id),
      ),
  };
}
