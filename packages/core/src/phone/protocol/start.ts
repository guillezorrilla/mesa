// What the phone asks to start work (#1065): the projects and a project's worktrees to pick from,
// starting a session (`mesa open`), a project's followed tickets,
// one ticket and assigning it (`mesa tickets`), and the native conversations to search and resume
// (`mesa history`, `adopt`).
// rpc.ts adds these calls to phoneCall and their results.
import { z } from 'zod';
import { AGENT_NAMES } from '../../agents/names.js';

/** Where a new session runs: the main checkout, a new worktree, or a linked one that exists. */
export const PLACES = ['checkout', 'worktree', 'existing'] as const;
export type Place = (typeof PLACES)[number];

/** The longest goal, as a reply allows. */
const GOAL_MAX = 20_000;

/** A session to start: `mesa open <project>` with its goal, agent, place, `--after` and `--from`. */
export const startCall = z.object({
  method: z.literal('start'),
  project: z.string(),
  goal: z.string().max(GOAL_MAX),
  /** None takes the project's. */
  agent: z.enum(AGENT_NAMES).optional(),
  place: z.enum(PLACES),
  /** With `worktree`, its branch, new or existing; none lets Mesa name one. */
  branch: z.string().optional(),
  /** With `existing`, the linked worktree's path. */
  checkout: z.string().optional(),
  /** The session it waits for, queued until that one is over. */
  after: z.string().optional(),
  /** A ticket's id (or a link) it starts from, imported first when it is not yet. */
  from: z.string().optional(),
  /** Past the guardrail's ask (Start anyway). */
  yes: z.boolean().optional(),
});
export type StartCall = z.infer<typeof startCall>;

/** A registered project as the phone lists it. */
export const phoneProject = z.object({ name: z.string(), label: z.string() });

/** A ticket as the phone lists it: Mesa's id, the provider's key, and whose it is. */
export const phoneTicket = z.object({
  id: z.string(),
  key: z.string(),
  summary: z.string(),
  status: z.string(),
  /** Its shared category (new, indeterminate, done); a string, so a newer Mac's still reaches. */
  category: z.string(),
  assignee: z.string().optional(),
  mine: z.boolean(),
  url: z.string(),
  /** The Atlassian site it is on (Jira), which `ticket` and `assign` need. */
  site: z.string().optional(),
  /** Live sessions started from it. */
  sessions: z.array(z.string()),
});
export type PhoneTicket = z.infer<typeof phoneTicket>;

/** A followed view, or why it lists nothing. */
export const phoneView = z.object({
  name: z.string(),
  note: z.string().optional(),
  error: z.string().optional(),
});

/** One ticket whole, its description and newest comments cut for a phone. */
export const phoneTicketDetail = z.object({
  id: z.string(),
  key: z.string(),
  summary: z.string(),
  status: z.string(),
  url: z.string(),
  mine: z.boolean(),
  assignees: z.array(z.string()),
  description: z.string(),
  comments: z.array(z.object({ author: z.string(), at: z.string(), text: z.string() })),
  sessions: z.array(z.string()),
});
export type PhoneTicketDetail = z.infer<typeof phoneTicketDetail>;

/** A native conversation, listed or found by its text, and the Mesa session it already is. */
export const phoneConversation = z.object({
  project: z.string(),
  agent: z.string(),
  id: z.string(),
  /** Its native name, or the matched text, or its first words. */
  title: z.string(),
  at: z.string().optional(),
  importedAs: z.string().optional(),
  /** Another profile holds it, so it cannot be resumed here. */
  elsewhere: z.boolean(),
});
export type PhoneConversation = z.infer<typeof phoneConversation>;

/** The start calls, which rpc.ts adds to phoneCall. */
export const startCalls = [
  z.object({ method: z.literal('projects') }),
  z.object({ method: z.literal('worktrees'), project: z.string() }),
  startCall,
  z.object({ method: z.literal('tickets'), project: z.string() }),
  z.object({ method: z.literal('ticket'), id: z.string(), site: z.string().optional() }),
  z.object({ method: z.literal('assign'), id: z.string(), site: z.string().optional() }),
  /** The newest conversations across projects, or those whose text holds `query`. */
  z.object({ method: z.literal('history'), query: z.string().max(200).optional() }),
  z.object({ method: z.literal('adopt'), project: z.string(), id: z.string() }),
] as const;

/** A started session, or the guardrail's ask or block with its reason, which opened nothing. */
export const startResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('started'), session: z.string() }),
  z.object({ status: z.enum(['ask', 'blocked']), reason: z.string().optional() }),
]);
export type StartResult = z.infer<typeof startResult>;

/** Each start call's result, which rpc.ts adds to callResults. */
export const startResults = {
  projects: z.object({ projects: z.array(phoneProject) }),
  worktrees: z.object({ worktrees: z.array(z.object({ path: z.string(), branch: z.string() })) }),
  start: startResult,
  tickets: z.object({ views: z.array(phoneView), tickets: z.array(phoneTicket) }),
  ticket: phoneTicketDetail,
  assign: z.object({ assignee: z.string() }),
  history: z.object({ conversations: z.array(phoneConversation), partial: z.boolean() }),
  adopt: z.object({ session: z.string() }),
};
