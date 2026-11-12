// What the phone asks about the profile's automations (#1067): its rules as sentences, its runs
// with their outcome, approving or cancelling a waiting run, turning a rule on or off, and adding
// a simple schedule rule. rpc.ts adds these calls to phoneCall and their results.
import { z } from 'zod';

/** A rule as the phone lists it: its name, project, whether it is on, and its sentence. */
export const phoneRule = z.object({
  name: z.string(),
  project: z.string(),
  enabled: z.boolean(),
  /** core's describeAutomation: when it fires, what it does, and whether it asks first. */
  sentence: z.string(),
});
export type PhoneRule = z.infer<typeof phoneRule>;

/** A run of a rule: its status (a string, so a newer Mac's still reaches), when, and why. */
export const phoneRun = z.object({
  id: z.string(),
  rule: z.string(),
  status: z.string(),
  /** When its trigger fired. */
  at: z.string(),
  endedAt: z.string().optional(),
  reason: z.string().optional(),
});
export type PhoneRun = z.infer<typeof phoneRun>;

/** A schedule rule the phone can add: open a session in `project` with `goal` on `cron`. */
export const scheduleRule = z.object({
  name: z.string(),
  project: z.string(),
  cron: z.string(),
  goal: z.string(),
  ask: z.boolean(),
});
export type ScheduleRule = z.infer<typeof scheduleRule>;

/** The automation calls, which rpc.ts adds to phoneCall. */
export const automationCalls = [
  z.object({ method: z.literal('automations') }),
  z.object({ method: z.literal('rule'), name: z.string(), enabled: z.boolean() }),
  z.object({ method: z.literal('run'), id: z.string(), act: z.enum(['approve', 'cancel']) }),
  z.object({ method: z.literal('addRule'), rule: scheduleRule }),
] as const;

/** Each automation call's result, which rpc.ts adds to callResults. */
export const automationResults = {
  automations: z.object({
    /** Whether the scheduler is installed, without which no rule runs. */
    installed: z.boolean(),
    rules: z.array(phoneRule),
    /** Newest first. */
    runs: z.array(phoneRun),
    /** The projects a new rule can name. */
    projects: z.array(z.string()),
  }),
  rule: z.object({}),
  run: z.object({}),
  addRule: z.object({}),
};
