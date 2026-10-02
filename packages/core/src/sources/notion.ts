import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Account, Site } from './connection.js';

const API = 'https://api.notion.com/v1';

/** The Notion API version every call pins (developers.notion.com/reference/versioning). */
export const NOTION_VERSION = '2026-03-11';

/** Where Notion items open on the web; an item's canonical URL is `<web>/<32 hex>`. */
export const NOTION_WEB = 'https://www.notion.so';

/** A Notion id as the API and the vault take it: its 32 hex, no dashes, lower case. */
export const notionId = (id: string) => id.replaceAll('-', '').toLowerCase();

/** A Notion page's or database's canonical URL, which an import takes. */
export const notionUrl = (id: string) => `${NOTION_WEB}/${notionId(id)}`;

/** Where Notion's links point (links.ts): its web app, old and new. */
export const NOTION_HOSTS = ['www.notion.so', 'notion.so', 'app.notion.com'];
/** A Notion id in a link's part, once its dashes are gone: the last 32 hex. */
export const NOTION_ID = /([0-9a-f]{32})$/i;

/** Rich text, as Notion's titles and text properties hold it. */
export const richText = z.array(z.object({ plain_text: z.string() })).nullish();
/** Rich text as one plain string; anything else as none. */
export const plain = (text: unknown) =>
  Array.isArray(text)
    ? text.map((t: { plain_text?: unknown }) => String(t?.plain_text ?? '')).join('')
    : '';

/** Where a page or a data source lives: its `type`, and a row's or a data source's database. */
export const parentSchema = z
  .object({ type: z.string(), database_id: z.string().optional() })
  .nullish();

/**
 * One call to Notion's API at `path`, over the source's authorized fetch, its JSON body parsed by
 * `schema`: a GET, or with `body` a POST, which Mesa sends only to search and to query a
 * database, both reads. Notion answers 404 for an item that is gone or not shared with Mesa:
 * not_found, saying so.
 */
export async function notionCall<T>(
  get: Http,
  path: string,
  schema: z.ZodType<T>,
  what: string,
  body?: unknown,
) {
  const headers = { 'notion-version': NOTION_VERSION };
  const response = await get(
    `${API}${path}`,
    body === undefined
      ? { headers }
      : {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  if (response.status === 404) {
    throw new MesaError(
      'not_found',
      `${what} is missing, or not shared with Mesa: share it with Mesa in Notion's Connections menu`,
    );
  }
  return readJson(response, schema, what);
}

const meSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  bot: z.object({
    owner: z
      .object({ type: z.string(), user: z.object({ name: z.string().nullish() }).optional() })
      .optional(),
    workspace_id: z.string(),
    workspace_name: z.string().nullish(),
  }),
});

const me = (get: Http) => notionCall(get, '/users/me', meSchema, 'Notion /users/me');

/** The signed-in Notion account: Mesa's bot in the workspace, named after the person who added it. */
export async function notionAccount(get: Http): Promise<Account> {
  const bot = await me(get);
  return { id: bot.id, name: bot.bot.owner?.user?.name ?? bot.name ?? 'Notion' };
}

/** The workspace the token reaches: a Notion connection is one workspace's. */
export async function notionSites(get: Http): Promise<Site[]> {
  const { bot } = await me(get);
  return [{ id: bot.workspace_id, name: bot.workspace_name ?? 'Notion', url: NOTION_WEB }];
}
