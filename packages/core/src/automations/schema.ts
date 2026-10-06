import { z } from 'zod';
import { AGENT_STATES } from '../agents/states.js';
import { relativeFilePath } from '../files/path.js';
import { SESSION_ID_PATTERN } from '../sessions/id.js';
import { cronFields } from './cron.js';

const text = z.string().trim().min(1);
const TRIGGER_FIELDS = { cron: ['cron'], file: ['file'], state: ['state'] } as const;
const ACTION_FIELDS = {
  skill: ['skill', 'args', 'agent'],
  send: ['session', 'prompt'],
  open: ['goal', 'agent'],
  refresh: ['notes', 'agent'],
} as const;
const REQUIRED_ACTION = {
  skill: ['skill'],
  send: ['session', 'prompt'],
  open: ['goal'],
  refresh: [],
} as const;

/** Profile-local rules. Trigger and action details exist only for the selected kinds. */
export const AutomationRuleSchema = z
  .strictObject({
    name: text.max(80),
    project: text,
    enabled: z.boolean().default(true),
    when: z.enum(['cron', 'file', 'state']),
    cron: text.optional(),
    file: text
      .refine((path) => {
        try {
          relativeFilePath(path);
          return !path.includes('\\');
        } catch {
          return false;
        }
      }, 'file must be a project-relative path without ..')
      .optional(),
    state: z.enum(AGENT_STATES).optional(),
    run: z.enum(['skill', 'send', 'open', 'refresh']),
    skill: text.optional(),
    args: z.array(z.string()).optional(),
    session: z.string().regex(SESSION_ID_PATTERN).optional(),
    prompt: z.string().min(1).max(20_000).optional(),
    goal: z.string().min(1).max(20_000).optional(),
    notes: z.boolean().optional(),
    agent: z.enum(['claude', 'codex']).optional(),
    guardrail: z.enum(['ask', 'allow']),
  })
  .superRefine((rule, ctx) => {
    const allowed: readonly string[] = [...TRIGGER_FIELDS[rule.when], ...ACTION_FIELDS[rule.run]];
    const details = [
      ...new Set([...Object.values(TRIGGER_FIELDS).flat(), ...Object.values(ACTION_FIELDS).flat()]),
    ];
    for (const key of details) {
      if (rule[key] !== undefined && !allowed.includes(key))
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `${key} does not apply to this trigger/action`,
        });
    }
    for (const key of [...TRIGGER_FIELDS[rule.when], ...REQUIRED_ACTION[rule.run]]) {
      if (rule[key] === undefined)
        ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required` });
    }
    if (rule.when === 'cron' && rule.cron) {
      try {
        cronFields(rule.cron);
      } catch {
        ctx.addIssue({
          code: 'custom',
          path: ['cron'],
          message: 'invalid five-field numeric cron',
        });
      }
    }
  });

export type AutomationRule = z.infer<typeof AutomationRuleSchema>;
export const AutomationRulesSchema = z
  .array(AutomationRuleSchema)
  .refine(
    (rules) => new Set(rules.map((r) => r.name.toLowerCase())).size === rules.length,
    'automation names must be unique',
  );
