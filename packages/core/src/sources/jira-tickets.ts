import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { issueUrl, jiraAgileApi, jiraApi } from './atlassian.js';
import type { Site } from './connection.js';

// The Jira reads a project's Tickets tab needs (CONTEXT.md, Ticket view): boards and their
// sprints (Jira Software's API, its own scopes), saved filters, and the tickets a JQL query finds.

/** How many boards, filters, or tickets one read lists. */
// ponytail: one page each; a search narrows boards and filters, a view's JQL narrows tickets.
const PAGE = 50;
const TICKETS = 100;

/** A 2xx body parsed by `schema`, else Jira's own error messages, which name what is wrong. */
async function jiraJson<T>(response: Response, schema: z.ZodType<T>, what: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { errorMessages?: unknown };
    const messages = Array.isArray(body.errorMessages) ? body.errorMessages.join(' ') : '';
    throw new MesaError(
      response.status === 404 ? 'not_found' : 'internal',
      `${what} answered HTTP ${response.status}${messages ? `: ${messages}` : ''}`,
    );
  }
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) throw new MesaError('internal', `${what} answered an unexpected body`);
  return parsed.data;
}

const boardSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  location: z.object({ projectKey: z.string().optional() }).optional(),
});
export type Board = { id: number; name: string; type: string; project?: string };
const toBoard = (b: z.infer<typeof boardSchema>): Board => ({
  id: b.id,
  name: b.name,
  type: b.type,
  ...(b.location?.projectKey ? { project: b.location.projectKey } : {}),
});

/** The site's boards whose name holds `search`, if given. */
export async function boards(get: Http, site: Site, search?: string): Promise<Board[]> {
  const name = search?.trim() ? `&name=${encodeURIComponent(search.trim())}` : '';
  const body = await jiraJson(
    await get(`${jiraAgileApi(site.id)}/board?maxResults=${PAGE}${name}`),
    z.object({ values: z.array(boardSchema) }),
    'Jira boards',
  );
  return body.values.map(toBoard);
}

/**
 * Board `id` from the board list. Reading one board by id takes a scope (read:issue-details:jira)
 * Mesa does not ask for, so the list is paged instead; undefined when no page has it.
 */
// ponytail: at most 10 pages (500 boards), read only when a view is added.
export async function findBoard(get: Http, site: Site, id: number): Promise<Board | undefined> {
  for (let page = 0; page < 10; page++) {
    const body = await jiraJson(
      await get(`${jiraAgileApi(site.id)}/board?startAt=${page * PAGE}&maxResults=${PAGE}`),
      z.object({ values: z.array(boardSchema), isLast: z.boolean().optional() }),
      'Jira boards',
    );
    const found = body.values.find((b) => b.id === id);
    if (found) return toBoard(found);
    if (body.isLast !== false || !body.values.length) return undefined;
  }
  return undefined;
}

export type Sprint = { id: number; name: string; startDate?: string };

/**
 * Board `id`'s own sprints in `state`, Jira's order (by start). Jira also lists other boards'
 * sprints that hold issues this board's filter shows (seen live, #693), so only those that began
 * on this board are kept, unless Jira names no origin for any. A kanban board has no sprints:
 * a usage error says what to follow instead.
 */
export async function sprints(
  get: Http,
  site: Site,
  id: number,
  state: 'active' | 'future',
): Promise<Sprint[]> {
  const body = await jiraJson(
    await get(`${jiraAgileApi(site.id)}/board/${id}/sprint?state=${state}&maxResults=${PAGE}`),
    z.object({
      values: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
          startDate: z.string().optional(),
          originBoardId: z.number().optional(),
        }),
      ),
    }),
    'Jira sprints',
  ).catch((error: unknown) => {
    if (error instanceof MesaError && /does not support sprints/i.test(error.message))
      throw new MesaError(
        'usage',
        `board ${id} has no sprints (a kanban board): follow its saved filter or a JQL query instead`,
      );
    throw error;
  });
  const own = body.values.filter((s) => s.originBoardId === id);
  const named = body.values.some((s) => s.originBoardId !== undefined);
  return (named ? own : body.values).map(({ id, name, startDate }) => ({
    id,
    name,
    ...(startDate ? { startDate } : {}),
  }));
}

export type Filter = { id: string; name: string };
const filterSchema = z.object({ id: z.string(), name: z.string() });

/** The saved filters the person can see whose name holds `search`, if given. */
export async function filters(get: Http, site: Site, search?: string): Promise<Filter[]> {
  const name = search?.trim() ? `&filterName=${encodeURIComponent(search.trim())}` : '';
  const body = await jiraJson(
    await get(`${jiraApi(site.id)}/filter/search?maxResults=${PAGE}${name}`),
    z.object({ values: z.array(filterSchema) }),
    'Jira filters',
  );
  return body.values.map(({ id, name }) => ({ id, name }));
}

/** Saved filter `id`. */
export async function filter(get: Http, site: Site, id: string): Promise<Filter> {
  const { name } = await jiraJson(
    await get(`${jiraApi(site.id)}/filter/${encodeURIComponent(id)}`),
    filterSchema,
    'Jira filter',
  );
  return { id, name };
}

export type JiraTicket = {
  key: string;
  summary: string;
  status: string;
  /** Jira's status category: new (to do), indeterminate (in progress), or done. */
  category: string;
  priority?: string;
  assignee?: string;
  /** The assignee's Atlassian account id, which says whether the ticket is the person's. */
  assigneeId?: string;
  url: string;
};

const ticketsSchema = z.object({
  issues: z.array(
    z.object({
      key: z.string(),
      fields: z.object({
        summary: z.string(),
        status: z
          .object({
            name: z.string(),
            statusCategory: z.object({ key: z.string() }).optional(),
          })
          .optional(),
        assignee: z.object({ displayName: z.string(), accountId: z.string().optional() }).nullish(),
        priority: z.object({ name: z.string() }).nullish(),
      }),
    }),
  ),
});

/** The first TICKETS tickets `jql` finds on the site. */
export async function searchTickets(get: Http, site: Site, jql: string): Promise<JiraTicket[]> {
  const body = await jiraJson(
    await get(
      `${jiraApi(site.id)}/search/jql?jql=${encodeURIComponent(jql)}&fields=summary,status,assignee,priority&maxResults=${TICKETS}`,
    ),
    ticketsSchema,
    'Jira search',
  );
  return body.issues.map(({ key, fields }) => ({
    key,
    summary: fields.summary,
    status: fields.status?.name ?? '',
    category: fields.status?.statusCategory?.key ?? 'new',
    ...(fields.priority ? { priority: fields.priority.name } : {}),
    ...(fields.assignee ? { assignee: fields.assignee.displayName } : {}),
    ...(fields.assignee?.accountId ? { assigneeId: fields.assignee.accountId } : {}),
    url: issueUrl(site, key),
  }));
}

/**
 * Assigns issue `key` to account `accountId`: Mesa's one write to Jira, which needs the
 * write:jira-work scope (a token without it gets the reconnect error, authorizedFetch).
 */
export async function assignIssue(get: Http, site: Site, key: string, accountId: string) {
  const response = await get(`${jiraApi(site.id)}/issue/${encodeURIComponent(key)}/assignee`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId }),
  });
  if (response.ok) return;
  await jiraJson(response, z.unknown(), `Assigning ${key}`);
}
