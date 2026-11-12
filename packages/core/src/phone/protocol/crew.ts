// What the phone asks about a coordinator's crew (CONTEXT.md, Crew; #1066): its workers and their
// latest reports, its task graph, the open decision gates with the Decision model's advice, and
// merging a worker's branch back. rpc.ts adds these calls to phoneCall and their results.
import { z } from 'zod';

/** A worker's newest report that says something: done, failed, blocked, a question and the like. */
export const phoneReport = z.object({
  /** A report kind (CONTEXT.md, Child report); a string, so a newer Mac's kind still reaches. */
  kind: z.string(),
  at: z.string(),
  message: z.string(),
  outcome: z.string().optional(),
});

/** One of the coordinator's workers: its state, branch and newest report. */
export const phoneWorker = z.object({
  id: z.string(),
  title: z.string(),
  state: z.string(),
  branch: z.string().nullable(),
  report: phoneReport.optional(),
});
export type PhoneWorker = z.infer<typeof phoneWorker>;

/** One task of the coordinator's graph, its deps by task id, its open gate if it has one. */
export const phoneTask = z.object({
  id: z.string(),
  title: z.string(),
  /** A task state (CONTEXT.md, Task graph), as a string like a session state. */
  state: z.string(),
  deps: z.array(z.string()),
  worker: z.string().optional(),
  gate: z.string().optional(),
});
export type PhoneTask = z.infer<typeof phoneTask>;

export const phoneCrew = z.object({ workers: z.array(phoneWorker), tasks: z.array(phoneTask) });
export type PhoneCrew = z.infer<typeof phoneCrew>;

/** An open decision gate as Needs you lists it: what to decide, on which task, for whom. */
export const phoneGate = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  /** Its task's title. */
  task: z.string(),
  coordinator: z.string().nullable(),
});
export type PhoneGate = z.infer<typeof phoneGate>;

/**
 * The Decision model's advice on a gate (the next-step site over its options): accepted,
 * abstained or unavailable (with why), the option it picks, and each option's probability in
 * the gate's order, with what it gives to deferring to the person.
 */
export const gateAdvice = z.object({
  status: z.string(),
  pick: z.string().optional(),
  odds: z.array(z.object({ option: z.string(), p: z.number() })),
  defer: z.number().optional(),
  model: z.string().optional(),
  reason: z.string().optional(),
});
export type GateAdvice = z.infer<typeof gateAdvice>;

/** A worker's branch merged into its coordinator's checkout, or the files that stopped it. */
export const phoneMerge = z.object({
  merged: z.boolean(),
  branch: z.string(),
  conflicts: z.array(z.string()),
});
export type PhoneMerge = z.infer<typeof phoneMerge>;

/** The crew's calls, which rpc.ts adds to phoneCall. */
export const crewCalls = [
  z.object({ method: z.literal('crew'), id: z.string() }),
  z.object({ method: z.literal('gates') }),
  z.object({ method: z.literal('gate'), id: z.string() }),
  z.object({ method: z.literal('resolve'), id: z.string(), option: z.string() }),
  z.object({ method: z.literal('merge'), id: z.string() }),
] as const;

/** Each crew call's result, which rpc.ts adds to callResults. */
export const crewResults = {
  crew: phoneCrew,
  gates: z.object({ gates: z.array(phoneGate) }),
  gate: phoneGate.extend({ advice: gateAdvice }),
  resolve: z.object({}),
  merge: phoneMerge,
};
