import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Account, Site } from './connection.js';
import type { ItemRef } from './items.js';

/** ClickUp's API: v2 for Workspaces, tasks and comments, v3 for Docs. */
export const CLICKUP_API = 'https://api.clickup.com/api';

/** Where ClickUp items open on the web. */
export const CLICKUP_WEB = 'https://app.clickup.com';

/** Where ClickUp's links point (links.ts). */
export const CLICKUP_HOSTS = ['app.clickup.com'];

/**
 * One GET of ClickUp's API at `path` (a PUT of `put` as JSON when given), its JSON body parsed by
 * `schema`. ClickUp answers 404 for an item that is gone, and a 401 (authorizedFetch's
 * outOfReach) for one in a Workspace the person did not give Mesa: both not_found, saying so.
 */
export async function clickupCall<T>(
  get: Http,
  path: string,
  schema: z.ZodType<T>,
  what: string,
  put?: unknown,
) {
  const response = await get(
    `${CLICKUP_API}${path}`,
    put === undefined
      ? undefined
      : {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(put),
        },
  );
  if (response.status === 404 || response.status === 401) {
    throw new MesaError(
      'not_found',
      `${what} is missing, or in a Workspace Mesa was not given: reconnect ClickUp and pick that Workspace`,
    );
  }
  return readJson(response, schema, what);
}

const userSchema = z.object({
  user: z.object({ id: z.number(), username: z.string().nullish(), email: z.string().nullish() }),
});

/** The signed-in ClickUp account. */
export async function clickupAccount(get: Http): Promise<Account> {
  const { user } = await clickupCall(get, '/v2/user', userSchema, 'ClickUp /v2/user');
  return {
    id: String(user.id),
    name: user.username || user.email || 'ClickUp',
    ...(user.email ? { email: user.email } : {}),
  };
}

const teamsSchema = z.object({ teams: z.array(z.object({ id: z.string(), name: z.string() })) });

/** The Workspaces (v2's teams) the person gave Mesa when signing in. */
export async function clickupSites(get: Http): Promise<Site[]> {
  const { teams } = await clickupCall(get, '/v2/team', teamsSchema, 'ClickUp /v2/team');
  return teams.map((team) => ({ id: team.id, name: team.name, url: `${CLICKUP_WEB}/${team.id}` }));
}

/**
 * What a ClickUp link names: a task, by its id (`/t/<id>`) or by its custom id in a Workspace
 * (`/t/<workspace>/<custom id>`), or a Doc page (`/<workspace>/v/dc/<doc>/<page>`).
 */
export type ClickupLink = TaskLink | { kind: 'page'; workspace: string; doc: string; page: string };
/** A task link; `workspace` only for a custom id, which ClickUp reads within its Workspace. */
export type TaskLink = { kind: 'task'; id: string; workspace?: string };

/** A task's title: its custom id, when it has one, then its name. */
export const clickupTitle = (task: { name: string; custom_id?: string | null }) =>
  task.custom_id ? `${task.custom_id}: ${task.name}` : task.name;

const ID = '([A-Za-z0-9_-]+)';
const TASK = new RegExp(`^/t/(?:${ID}/)?${ID}/?$`);
const PAGE = new RegExp(`^/${ID}/v/dc/${ID}/${ID}/?$`);

/**
 * The task or Doc page `url`'s path names; undefined when it names neither. A custom id holds a
 * dash (its prefix's); a plain id under a Workspace (`/t/<workspace>/<id>`) is read as `/t/<id>`.
 */
export function clickupLink(url: URL): ClickupLink | undefined {
  const task = TASK.exec(url.pathname);
  if (task?.[2]) {
    const custom = task[1] && task[2].includes('-');
    return { kind: 'task', id: task[2], ...(custom ? { workspace: task[1] } : {}) };
  }
  const page = PAGE.exec(url.pathname);
  if (page?.[1] && page[2] && page[3])
    return { kind: 'page', workspace: page[1], doc: page[2], page: page[3] };
  return undefined;
}

/** Whether an imported ClickUp item, by its canonical URL, is a task (not a Doc page). */
export const isClickupTask = (url: string) => {
  try {
    return clickupLink(new URL(url))?.kind === 'task';
  } catch {
    return false;
  }
};

/** A task's or a Doc page's canonical URL, which an import takes. */
export const clickupUrl = (link: ClickupLink) =>
  link.kind === 'task'
    ? `${CLICKUP_WEB}/t/${link.workspace ? `${link.workspace}/` : ''}${link.id}`
    : `${CLICKUP_WEB}/${link.workspace}/v/dc/${link.doc}/${link.page}`;

/** The item `link` names: a task's folder is its id, a Doc page's `<doc>.<page>`. */
export const clickupRef = (link: ClickupLink): ItemRef => ({
  source: 'clickup',
  id: link.kind === 'task' ? link.id : `${link.doc}.${link.page}`,
  url: clickupUrl(link),
});

/** What a ClickUp view of tasks follows: a List, every List in a Folder or Space, or a saved view. */
export type ClickupLocationKind = 'list' | 'folder' | 'space' | 'view';

const LOCATION_CODES: Record<string, ClickupLocationKind> = { li: 'list', f: 'folder', s: 'space' };

/**
 * The List, Folder, Space or saved view a ClickUp link names, and its Workspace: `/<ws>/v/li/<id>`
 * (`f` a Folder, `s` a Space), a view of one of them such as `/<ws>/v/b/li/<id>`, or a saved
 * view, `/<ws>/v/<type>/<view id>`. Undefined for any other link (a task, a Doc).
 */
export function clickupLocationLink(
  url: URL,
): { workspace: string; kind: ClickupLocationKind; id: string } | undefined {
  if (!CLICKUP_HOSTS.includes(url.host)) return undefined;
  const [, workspace, v, code = '', ...rest] = url.pathname.split('/');
  if (!workspace || v !== 'v' || !rest[0] || code === 'dc') return undefined;
  const of = (kind: ClickupLocationKind | undefined, id: string | undefined) =>
    kind && id && /^[\w-]+$/.test(id) ? { workspace, kind, id } : undefined;
  const direct = LOCATION_CODES[code];
  if (direct) return of(direct, rest[0]);
  const inner = LOCATION_CODES[rest[0]];
  return inner ? of(inner, rest[1]) : of('view', rest[0]);
}
