import type { MesaContext } from '../context.js';
import type { Faro } from '../decisions/faro.js';
import { MesaError } from '../lib/result.js';
import type { sessionsService } from '../sessions/service.js';
import type { importService } from '../sources/import-service.js';
import type { AutomationRun } from './state.js';

export type AutomationActions = {
  sessions: ReturnType<typeof sessionsService>['sessions'];
  refresh: ReturnType<typeof importService>['refresh'];
};

/** Dispatch through the normal owners, with rule provenance and no force override. */
export async function automationAction(
  ctx: MesaContext,
  faro: Faro,
  actions: AutomationActions,
  run: AutomationRun,
) {
  const { rule, trigger } = run;
  const automation = { rule: rule.name, run: run.id };
  let warning: string | undefined;
  const recorded = await ctx.record(
    {
      kind: 'automation',
      summary: () => `Automation ${rule.name}: ${rule.run}`,
      failure: `Automation ${rule.name} failed`,
      scope: { project: rule.project },
      inputs: { automation, trigger, action: rule.run, approved: run.approved },
      warning: () => warning,
      outputs: (result: Record<string, unknown>) => result,
    },
    async (decisions) => {
      if (trigger.decision) decisions.record(trigger.decision);
      await faro.guardrail.gate(
        {
          action: rule.run,
          target: rule.session ?? rule.project,
          project: rule.project,
          text: rule.prompt ?? rule.goal ?? `${rule.run} ${rule.skill ?? 'imported items'}`,
        },
        { yes: run.approved },
        decisions,
      );
      if (rule.run === 'refresh') {
        const done = await actions.refresh(rule.project, [], rule.notes ?? true, {
          changedOnly: true,
          agent: rule.agent ?? 'claude',
          yes: run.approved,
          automation,
        });
        if (done.result.notes?.ok === false || done.result.notesRuns?.some((r) => !r.ok))
          throw new MesaError('internal', done.result.notes?.reason ?? 'refresh notes failed');
        warning = done.warning;
        return {
          checked: done.result.checked,
          skipped: done.result.skipped,
          refreshed: done.result.refreshed,
          notesRetried: done.result.notesRetried,
          receipt: done.receipt,
        };
      }
      if (rule.run === 'skill') {
        const done = await actions.sessions.run(rule.skill as string, {
          project: rule.project,
          args: rule.args,
          agent: rule.agent ?? 'claude',
          yes: run.approved,
          automation,
        });
        if (!done.result.ok)
          throw new MesaError('internal', done.result.reason ?? 'skill run failed');
        warning = done.warning;
        return { session: done.result.session, receipt: done.receipt };
      }
      if (rule.run === 'open') {
        const done = await actions.sessions.open(rule.project, {
          goal: rule.goal,
          agent: rule.agent ?? 'claude',
          automation,
        });
        warning = done.warning;
        return { session: done.result.id, receipt: done.receipt };
      }
      const session = ctx.store.get(rule.session as string);
      if (session.project !== rule.project)
        throw new MesaError('usage', 'automation target belongs to another project');
      const done = await actions.sessions.send(session.id, rule.prompt as string, {
        yes: run.approved,
        noFrom: true,
      });
      warning = done.warning;
      return { session: session.id, receipt: done.receipt };
    },
  );
  return {
    ...recorded.result,
    automationReceipt: recorded.receipt,
    ...(recorded.warning ? { warning: recorded.warning } : {}),
  };
}
