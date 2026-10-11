import type { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Account, Site } from '../sources/connection.js';
import type { JiraField } from '../sources/jira.js';
import type { SourceId } from '../sources/sources.js';

// What every ticket provider (Jira, and the trackers after it) gives the Tickets tab
// (CONTEXT.md, Ticket view). The rows live in providers.ts; service.ts reads only through them.

/**
 * A status's shared category, which the tab groups by: new (to do), indeterminate (in
 * progress), or done. Jira's own keys; every provider maps its statuses onto them.
 */
export type TicketCategory = 'new' | 'indeterminate' | 'done';
const CATEGORIES: readonly string[] = ['new', 'indeterminate', 'done'];

/** `key` as a shared category, one not known counting as to do. */
export const categoryOf = (key: string | undefined): TicketCategory =>
  CATEGORIES.includes(key ?? '') ? (key as TicketCategory) : 'new';

/** A ticket as a provider lists it, before the tab adds whose it is and its sessions. */
export type ProviderTicket = {
  /** The provider's own id, such as LC-12 or owner/repo#12. */
  key: string;
  summary: string;
  status: string;
  category: TicketCategory;
  priority?: string;
  assignee?: string;
  /** The assignee's account id in the provider, which says whether the ticket is the person's. */
  assigneeId?: string;
  /** Every assignee, where a provider allows several (GitHub); `assignee` is the first. */
  assignees?: { id: string; name: string }[];
  url: string;
  /** The Atlassian site it is on (Jira). */
  site?: string;
};

/** What a view lists now, the query sent for it, and what it read or why it lists nothing. */
export type ViewRead = {
  tickets: ProviderTicket[];
  /** The query the provider was sent (Jira's JQL, GitHub's request), shown under Advanced. */
  query?: string;
  /** A board view's sprints this read. */
  sprints?: string[];
  /** Why it lists nothing that is not an error: a board with no active sprint. */
  note?: string;
  /** It listed a full page, so there may be more. */
  more?: boolean;
};

/** What a provider row reads through: the profile's Connections and the fields panels show. */
export type ProviderDeps = {
  fetch: (source: SourceId) => Http;
  sites: (source: SourceId) => Promise<Site[] | undefined>;
  /** The Jira fields every ticket panel shows after its own. */
  fields: () => JiraField[];
  /** The repo (owner/repo) of `project`'s origin remote on github.com, if it has one. */
  origin: (project: string) => Promise<string | undefined>;
};

/**
 * One provider's reads and its one write, over views of type `View` and panels of type `Detail`.
 * `where` names the provider's place a key is on when a connection reaches several (Jira's site).
 * Its reads are methods, so each row may take only its own provider's inputs and views while
 * every row has the same type over all of them: the service gives a row only its own (a view's
 * `provider` keeps them apart).
 */
export type TicketProvider<Input, View, Detail> = {
  /** `input` as a view, checked against the provider first when `check` (adding it). */
  view(input: Input, check: boolean): Promise<View>;
  read(view: View): Promise<ViewRead>;
  /** `input` as one of the provider's ticket keys, or a usage error. */
  key: (input: string) => string;
  /** Ticket `key` whole, for the panel, with whether it is the person's. */
  show: (key: string, where?: string) => Promise<Detail & { url: string; mine: boolean }>;
  /** The signed-in account, whose id says which tickets are the person's. */
  me: () => Promise<Account>;
  /** The name of the place `where` names, or the one place the connection reaches, for receipts. */
  place: (where?: string) => Promise<string>;
  /** Assigns ticket `key` to the signed-in person, beside any others where a provider allows several, and names them. */
  assign: (key: string, where?: string) => Promise<{ assignee: string }>;
};

/** `input` parsed by `schema`, or a usage error naming what is wrong with it. */
export function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new MesaError('usage', parsed.error.issues[0]?.message ?? 'invalid ticket view');
  return parsed.data;
}
