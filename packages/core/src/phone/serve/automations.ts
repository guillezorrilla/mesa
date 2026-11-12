import type { z } from 'zod';
import { describeAutomation } from '../../automations/describe.js';
import type { AutomationRule, AutomationRuleSchema } from '../../automations/schema.js';
import type { AutomationRun } from '../../automations/state.js';
import { type automationCalls, automationResults } from '../protocol/automations.js';
import type { CallResult } from '../protocol/rpc.js';

/** The automation functions the CLI uses (`mesa automations ...`, `mesa projects`). */
export type AutomationDeps = {
  list: () => AutomationRule[];
  status: () => Promise<{ installed: boolean; runs: AutomationRun[] }>;
  setEnabled: (name: string, enabled: boolean) => unknown;
  approve: (id: string) => unknown;
  cancel: (id: string) => unknown;
  add: (rule: z.input<typeof AutomationRuleSchema>) => unknown;
  /** The registered projects whose folder still exists. */
  projects: () => string[];
};

/** How many runs the phone lists, newest first. */
const RUNS = 30;

type AutomationCall = z.infer<(typeof automationCalls)[number]>;
export const isAutomationCall = (call: { method: string }): call is AutomationCall =>
  Object.hasOwn(automationResults, call.method);

/** Answers one automation call (#1067); throws core's MesaError for an unknown rule or run. */
export async function answerAutomationCall(
  deps: AutomationDeps,
  call: AutomationCall,
): Promise<unknown> {
  if (call.method === 'automations') {
    const { installed, runs } = await deps.status();
    return {
      installed,
      rules: deps.list().map((rule) => ({
        name: rule.name,
        project: rule.project,
        enabled: rule.enabled,
        sentence: describeAutomation(rule),
      })),
      runs: runs
        .slice(-RUNS)
        .reverse()
        .map((run) => ({
          id: run.id,
          rule: run.rule.name,
          status: run.status,
          at: run.trigger.at,
          ...(run.endedAt ? { endedAt: run.endedAt } : {}),
          ...(run.reason ? { reason: run.reason } : {}),
        })),
      projects: deps.projects(),
    } satisfies CallResult<'automations'>;
  }
  if (call.method === 'rule') deps.setEnabled(call.name, call.enabled);
  else if (call.method === 'run') (call.act === 'approve' ? deps.approve : deps.cancel)(call.id);
  else {
    const { name, project, cron, goal, ask } = call.rule;
    deps.add({
      name,
      project,
      when: 'cron',
      cron,
      run: 'open',
      goal,
      guardrail: ask ? 'ask' : 'allow',
    });
  }
  return {};
}
