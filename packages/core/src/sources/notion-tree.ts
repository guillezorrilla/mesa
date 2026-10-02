import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { BROWSE_PAGE_SIZE, type BrowseChild, type BrowsePage, type SourceTree } from './browse.js';
import type { Site } from './connection.js';
import {
  NOTION_WEB,
  notionCall,
  notionId,
  notionUrl,
  parentSchema,
  plain,
  richText,
} from './notion.js';
import { pageTitle, propertiesSchema } from './notion-properties.js';

// Notion's tree, its node ids `<kind>:<id>`: the workspace's id, else Notion's 32 hex.
//
//   (root) > workspace > page > page ...
//                             > database > row (a page) ...
//                      > database > row ...
//
// A database node is a data source, the table inside a database that Notion's API (since
// 2025-09-03) queries for rows; a database holding several shows one node each. Pages and rows
// import; the rest only hold them. Each list is one page of Notion's own, its cursor Notion's
// `next_cursor`. Search and a database's query are POSTs, both reads.

type NotionNode = { kind: 'workspace' | 'page' | 'database'; id: string };

const HEX = /^[0-9a-f]{32}$/;

function parseNode(id: string): NotionNode {
  const [kind = '', of = '', ...rest] = id.split(':');
  const fits = kind === 'workspace' ? of !== '' : HEX.test(of);
  if ((kind === 'workspace' || kind === 'page' || kind === 'database') && fits && !rest.length)
    return { kind, id: of };
  throw new MesaError(
    'usage',
    `${id} is not a Notion node: take ids from mesa sources browse notion`,
  );
}

const child = (node: NotionNode, title: string, url: string): BrowseChild => ({
  id: `${node.kind}:${node.id}`,
  kind: node.kind,
  title: title || 'Untitled',
  url,
  hasChildren: true,
  importable: node.kind === 'page',
});
const page = (id: string, title: string) =>
  child({ kind: 'page', id: notionId(id) }, title, notionUrl(id));
const database = (id: string, databaseId: string, title: string) =>
  child({ kind: 'database', id: notionId(id) }, title, notionUrl(databaseId));

/** One page of a Notion list: its results, and the cursor of the next. */
const listOf = <T extends z.ZodType>(result: T) =>
  z.object({ results: z.array(result), next_cursor: z.string().nullish() });
const more = (next: string | null | undefined) => (next ? { cursor: next } : {});

/** A page or a data source, as search and a query answer them. */
const foundSchema = z.object({
  object: z.string(),
  id: z.string(),
  parent: parentSchema,
  properties: propertiesSchema.optional(),
  title: richText,
  database_parent: z.object({ type: z.string() }).nullish(),
});
type Found = z.infer<typeof foundSchema>;

const asChild = (found: Found) =>
  found.object === 'page'
    ? page(found.id, pageTitle(found.properties ?? {}))
    : database(found.id, found.parent?.database_id ?? found.id, plain(found.title));

/** One page of `POST /search`: `query`'s matches, or everything shared with Mesa. */
async function search(
  get: Http,
  cursor: string | undefined,
  query?: string,
  size = BROWSE_PAGE_SIZE,
) {
  return notionCall(get, '/search', listOf(foundSchema), 'Notion search', {
    ...(query ? { query } : { sort: { timestamp: 'last_edited_time', direction: 'descending' } }),
    page_size: size,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
}

/**
 * The workspace's top pages and databases: what search finds whose parent is the workspace, out
 * of 100 at a time (a page of them may hold none, with a cursor to the next).
 */
async function topLevel(get: Http, cursor: string | undefined): Promise<BrowsePage> {
  const body = await search(get, cursor, undefined, 100);
  const children = body.results
    .filter(
      (found) =>
        (found.object === 'page' ? found.parent : found.database_parent)?.type === 'workspace',
    )
    .map(asChild);
  return { children, ...more(body.next_cursor) };
}

const blockSchema = z.object({
  id: z.string(),
  type: z.string(),
  child_page: z.object({ title: z.string() }).optional(),
});
const databaseSchema = z.object({
  title: richText,
  data_sources: z.array(z.object({ id: z.string(), name: z.string().nullish() })),
});

/**
 * A page's child pages and databases, from its blocks (those at its top level: one inside a
 * toggle or a column is not listed). A database not shared with Mesa is left out.
 */
async function pageChildren(get: Http, id: string, cursor: string | undefined) {
  const query = `page_size=${BROWSE_PAGE_SIZE}${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ''}`;
  const body = await notionCall(
    get,
    `/blocks/${id}/children?${query}`,
    listOf(blockSchema),
    `Notion page ${id}'s blocks`,
  );
  const children: BrowseChild[] = [];
  for (const block of body.results) {
    if (block.type === 'child_page') children.push(page(block.id, block.child_page?.title ?? ''));
    if (block.type !== 'child_database') continue;
    const db = await notionCall(
      get,
      `/databases/${notionId(block.id)}`,
      databaseSchema,
      `Notion database ${block.id}`,
    ).catch((error) => {
      if (error instanceof MesaError && error.code === 'not_found') return undefined;
      throw error;
    });
    const title = plain(db?.title);
    for (const source of db?.data_sources ?? []) {
      const name = db?.data_sources.length === 1 ? title : `${title}: ${source.name ?? ''}`;
      children.push(database(source.id, block.id, name));
    }
  }
  return { children, ...more(body.next_cursor) };
}

/** A database's rows: its data source's pages, as Notion's default view orders them. */
async function rows(get: Http, id: string, cursor: string | undefined): Promise<BrowsePage> {
  const body = await notionCall(
    get,
    `/data_sources/${id}/query`,
    listOf(foundSchema),
    `Notion database ${id}'s rows`,
    { page_size: BROWSE_PAGE_SIZE, ...(cursor ? { start_cursor: cursor } : {}) },
  );
  const children = body.results.filter((found) => found.object === 'page').map(asChild);
  return { children, ...more(body.next_cursor) };
}

/**
 * Notion's tree: the root lists the connected workspace, the workspace its top pages and
 * databases, a page its child pages and databases, and a database its rows. A search is Notion's
 * own, by title across the whole workspace, whatever the node (Notion's search takes no parent).
 */
export const notionTree: SourceTree = async (get, sites, node, { cursor, search: query }) => {
  if (query) {
    const body = await search(get, cursor, query);
    return { children: body.results.map(asChild), ...more(body.next_cursor) };
  }
  if (node === undefined) {
    return {
      children: sites.map((site) =>
        child({ kind: 'workspace', id: site.id }, site.name, NOTION_WEB),
      ),
    };
  }
  const at = parseNode(node);
  switch (at.kind) {
    case 'workspace':
      workspaceNamed(sites, at.id);
      return topLevel(get, cursor);
    case 'page':
      return pageChildren(get, at.id, cursor);
    case 'database':
      return rows(get, at.id, cursor);
  }
};

function workspaceNamed(sites: Site[], id: string) {
  if (sites.some((site) => site.id === id)) return;
  throw new MesaError(
    'not_found',
    `workspace ${id} is not the connected Notion workspace (${sites.map((s) => s.name).join(', ')})`,
  );
}
