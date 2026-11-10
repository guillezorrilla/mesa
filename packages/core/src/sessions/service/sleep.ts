import type { MesaContext } from '../../context.js';
import { toFail } from '../../lib/result.js';
import { joinWarnings } from '../../receipts/recorder.js';
import { type SleepSeen, sleepBlocker, sleepSession } from '../end/sleep.js';
import { withParentsNow } from '../record/family.js';
import { projectScope } from '../record/general.js';
import { recordAgent, type SessionRecord } from '../record/record.js';
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
     * but `shown`, the one the app shows in a focused window, re-checking each under its lock just
     * before its agent quits. With sleep off it reads nothing. Returns the sessions put to sleep,
     * and why any could not be.
     */
    sleepIdle: async ({ shown }: { shown?: string } = {}) => {
      const afterMs = (ctx.configIfAny()?.sessions.sleepAfterMinutes ?? 0) * 60_000;
      if (afterMs <= 0) return { slept: [] as string[] };
      const records = store.readable();
      const running = new Set(
        (await tmux.listWindows()).filter((w) => !w.dead).map((w) => targetLabel(w)),
      );
      const seenOf = (r: SessionRecord, children: readonly SessionRecord[]): SleepSeen => ({
        now: ctx.clock(),
        afterMs,
        ...(shown ? { shown } : {}),
        alive: running.has(targetLabel(windowOf(r))),
        children,
      });
      // Its children are those that report to it now (familyOf), a predecessor's workers too.
      const childrenOf = new Map<string, SessionRecord[]>();
      for (const r of withParentsNow(records))
        if (r.parentNow) childrenOf.set(r.parentNow, [...(childrenOf.get(r.parentNow) ?? []), r]);
      const slept: string[] = [];
      const failed: string[] = [];
      for (const r of records) {
        if (sleepBlocker(r, seenOf(r, childrenOf.get(r.id) ?? []))) continue;
        try {
          const done = await sleepSession(
            { store, tmux, run: ctx.run, clock: ctx.clock, sleep: ctx.sleep },
            r.id,
            // As it is under its lock now: a prompt typed or a child opened since keeps it awake.
            (current) =>
              !sleepBlocker(
                current,
                seenOf(
                  current,
                  withParentsNow(store.readable()).filter((c) => c.parentNow === current.id),
                ),
              ),
          );
          if (done) slept.push(r.id);
        } catch (error) {
          failed.push(`session ${r.id} did not sleep: ${toFail(error).error.message}`);
        }
      }
      const warning = joinWarnings(...failed);
      return { slept, ...(warning ? { warning } : {}) };
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
