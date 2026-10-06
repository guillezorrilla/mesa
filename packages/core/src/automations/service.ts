import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import { redactWhole } from '../lib/redact.js';
import { MesaError, toFail } from '../lib/result.js';
import type { NotificationDelivery } from '../notifications/background.js';
import { isOver } from '../sessions/record/lifecycle.js';
import { type AutomationActions, automationAction } from './actions.js';
import { automationLaunchd } from './launchd.js';
import { automationRules } from './rules.js';
import { type AutomationRun, automationState } from './state.js';
import { observeRules } from './triggers.js';

/** Explicit installation, durable approvals and serial execution for one profile. */
export function automationsService(
  ctx: MesaContext,
  faro: Faro,
  actions: AutomationActions & { notify: () => Promise<NotificationDelivery> },
) {
  const rules = automationRules(ctx);
  const state = automationState(ctx.paths.automationState, ctx);
  const launchd = automationLaunchd(ctx);
  const now = () => ctx.clock().toISOString();
  const status = async () => ({ ...state.read(), ...(await launchd.status()) });
  const updateRun = (id: string, change: Partial<AutomationRun>) =>
    state.update((s) => {
      const run = s.runs.find((r) => r.id === id);
      if (!run) throw new MesaError('not_found', `no automation run ${id}`);
      Object.assign(run, change);
      return run;
    });
  const tick = async () => {
    ctx.open();
    const enabled = rules.list().filter((r) => r.enabled);
    if (!state.read().installed || !enabled.length) return { inert: true, runs: [] };
    const rows = enabled.some((r) => r.when === 'state') ? await actions.sessions.list() : [];
    const token = ctx.newId();
    const interrupted = new Set<string>();
    // ponytail: one worker for the profile, stricter than per-project serialization; split if throughput matters.
    const claimed = state.update((s) => {
      if (!s.installed) return false;
      for (const observed of observeRules(ctx, s, enabled, rows)) {
        s.runs.push({
          id: ctx.newId(),
          ...observed,
          status: observed.rule.guardrail === 'ask' ? 'pending' : 'queued',
          approved: false,
        });
      }
      if (s.worker && ctx.processAlive(s.worker.pid)) return false;
      for (const run of s.runs.filter((r) => r.status === 'running')) interrupted.add(run.id);
      s.worker = { token, pid: ctx.processId };
      return true;
    });
    if (!claimed) return { busy: true, runs: [] };
    const completed: AutomationRun[] = [];
    try {
      for (const session of ctx.store
        .list()
        .filter((r) => r.automation && interrupted.has(r.automation.run) && !isOver(r)))
        await actions.sessions.stop(session.id, true);
      state.update((s) => {
        for (const run of s.runs.filter((r) => interrupted.has(r.id) && r.status === 'running'))
          Object.assign(run, {
            status: 'failed',
            reason: 'scheduler interrupted; action was not replayed',
            endedAt: now(),
          });
      });
      for (;;) {
        const currentRules = rules.list();
        const run = state.update((s) => {
          if (!s.installed || s.worker?.token !== token) return undefined;
          for (const candidate of s.runs.filter(
            (r) => r.status === 'queued' || r.status === 'pending',
          )) {
            if (
              !currentRules.some(
                (r) => r.enabled && JSON.stringify(r) === JSON.stringify(candidate.rule),
              )
            ) {
              Object.assign(candidate, {
                status: 'cancelled',
                endedAt: now(),
                reason: 'rule removed, disabled or changed',
              });
            }
          }
          const next = s.runs.find((r) => r.status === 'queued');
          if (next) Object.assign(next, { status: 'running', startedAt: now() });
          return next;
        });
        if (!run) break;
        try {
          const result = await automationAction(ctx, faro, actions, run);
          completed.push(updateRun(run.id, { status: 'done', endedAt: now(), result }));
        } catch (error) {
          const fail = toFail(error).error;
          const ask =
            error instanceof MesaError &&
            error.code === 'guardrail_blocked' &&
            (error.details as { verdict?: string } | undefined)?.verdict === 'ask';
          completed.push(
            updateRun(run.id, {
              status: ask ? 'pending' : 'failed',
              reason: redactWhole(fail.message, ctx.home, ctx.secrets()),
              ...(ask ? {} : { endedAt: now() }),
            }),
          );
        }
      }
    } finally {
      state.update((s) => {
        if (s.worker?.token === token) delete s.worker;
      });
    }
    return { inert: false, runs: completed, notification: await actions.notify() };
  };
  const lifecycle = async <T>(action: () => Promise<T>): Promise<T> => {
    const token = ctx.newId();
    state.update((s) => {
      if (s.operation && ctx.processAlive(s.operation.pid))
        throw new MesaError('locked', 'another scheduler install or uninstall is still running');
      s.operation = { token, pid: ctx.processId };
    });
    try {
      return await action();
    } finally {
      state.update((s) => {
        if (s.operation?.token === token) delete s.operation;
      });
    }
  };
  return {
    ...rules,
    status,
    /** The run ledger's runs, which the notifications inbox reads failures from. */
    runs: () => state.read().runs,
    tick,
    install: () =>
      lifecycle(async () => {
        ctx.open();
        if (state.read().stopping)
          throw new MesaError('locked', 'finish uninstalling before reinstalling');
        if (state.read().installed) {
          const existing = await status();
          if (!existing.loaded)
            throw new MesaError(
              'locked',
              'scheduler is marked installed but is not loaded; run automations uninstall, then install again',
            );
          return existing;
        }
        if (launchd.exists())
          throw new MesaError(
            'usage',
            'scheduler plist already exists and is not owned by this profile',
          );
        if (state.read().worker)
          throw new MesaError('locked', 'uninstall the existing scheduler before reinstalling');
        state.update((s) => {
          if (s.installed || s.stopping)
            throw new MesaError('locked', 'scheduler installation is already in progress');
          s.installed = true;
        });
        try {
          await launchd.install();
        } catch (error) {
          state.update((s) => {
            s.installed = false;
          });
          throw error;
        }
        return status();
      }),
    uninstall: () =>
      lifecycle(async () => {
        ctx.open();
        if (!state.read().installed && !state.read().stopping) return status();
        state.update((s) => {
          s.installed = false;
          s.stopping = true;
          for (const run of s.runs.filter((r) => r.status === 'pending' || r.status === 'queued')) {
            Object.assign(run, {
              status: 'cancelled',
              endedAt: now(),
              reason: 'scheduler uninstalled',
            });
          }
        });
        await launchd.uninstall();
        for (let attempt = 0; attempt < 50; attempt++) {
          const s = state.read();
          const ids = new Set(s.runs.map((r) => r.id));
          for (const session of ctx.store
            .list()
            .filter((r) => r.automation && ids.has(r.automation.run) && !isOver(r))) {
            await actions.sessions.stop(session.id, true);
          }
          if (!s.worker || !ctx.processAlive(s.worker.pid)) {
            state.update((next) => {
              delete next.worker;
              delete next.stopping;
              for (const run of next.runs.filter((r) => r.status === 'running')) {
                Object.assign(run, {
                  status: 'cancelled',
                  endedAt: now(),
                  reason: 'scheduler uninstalled',
                });
              }
            });
            return status();
          }
          await ctx.sleep(100);
        }
        throw new MesaError(
          'locked',
          'scheduler unloaded, but an owned tick is still stopping; retry uninstall after it exits',
        );
      }),
    approve: (id: string) =>
      state.update((s) => {
        if (!s.installed) throw new MesaError('usage', 'scheduler is not installed');
        const run = s.runs.find((r) => r.id === id);
        if (!run) throw new MesaError('not_found', `no automation run ${id}`);
        if (run.status !== 'pending')
          throw new MesaError('usage', 'only pending runs can be approved');
        Object.assign(run, { approved: true, status: 'queued', reason: undefined });
        return run;
      }),
    cancel: (id: string) =>
      state.update((s) => {
        const run = s.runs.find((r) => r.id === id);
        if (!run) throw new MesaError('not_found', `no automation run ${id}`);
        if (run.status !== 'pending' && run.status !== 'queued')
          throw new MesaError('usage', 'only waiting runs can be cancelled');
        Object.assign(run, { status: 'cancelled', endedAt: now(), reason: 'cancelled by user' });
        return run;
      }),
  };
}
export type AutomationStatus = Awaited<ReturnType<ReturnType<typeof automationsService>['status']>>;
