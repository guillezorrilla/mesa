import { existsSync } from 'node:fs';
import { z } from 'zod';
import { DecisionSchema } from '../decisions/types.js';
import { ULID } from '../lib/ids.js';
import type { LockDeps } from '../lib/lock-file.js';
import { changeYaml, readYaml } from '../lib/yaml-file.js';
import { AutomationRuleSchema } from './schema.js';

const TriggerSchema = z.strictObject({
  kind: z.enum(['cron', 'file', 'state']),
  at: z.iso.datetime(),
  session: z.string().optional(),
  previous: z.string().optional(),
  value: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  source: z.string().optional(),
  decision: DecisionSchema.optional(),
});
export type AutomationTrigger = z.infer<typeof TriggerSchema>;
const RunSchema = z.strictObject({
  id: z.string().regex(ULID),
  rule: AutomationRuleSchema,
  trigger: TriggerSchema,
  status: z.enum(['pending', 'queued', 'running', 'done', 'failed', 'cancelled']),
  approved: z.boolean().default(false),
  startedAt: z.iso.datetime().optional(),
  endedAt: z.iso.datetime().optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().optional(),
});
export type AutomationRun = z.infer<typeof RunSchema>;
const StateSchema = z.strictObject({
  installed: z.boolean(),
  stopping: z.boolean().optional(),
  operation: z.strictObject({ token: z.string(), pid: z.number().int().positive() }).optional(),
  observations: z.record(z.string(), z.string()),
  observedAt: z.iso.datetime().optional(),
  worker: z.strictObject({ token: z.string(), pid: z.number().int().positive() }).optional(),
  // ponytail: full profile ledger; partition if its size makes reads expensive.
  runs: z.array(RunSchema),
});
export type AutomationState = z.infer<typeof StateSchema>;

/** Durable observations, approvals and run ledger. Short writes are separate from dispatch. */
export function automationState(file: string, deps: LockDeps) {
  const read = (): AutomationState =>
    existsSync(file)
      ? readYaml(file, StateSchema)
      : { installed: false, observations: {}, runs: [] };
  return {
    read,
    update: <T>(change: (state: AutomationState) => T): T => {
      let result: T | undefined;
      changeYaml(
        file,
        StateSchema,
        (current) => {
          const state = current ?? read();
          result = change(state);
          return state;
        },
        deps,
      );
      return result as T;
    },
  };
}
