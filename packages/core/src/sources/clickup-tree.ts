import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { BROWSE_PAGE_SIZE, type BrowseChild, type BrowsePage, type SourceTree } from './browse.js';
import { CLICKUP_WEB, clickupCall, clickupUrl } from './clickup.js';
import type { Site } from './connection.js';

// ClickUp's tree, its node ids `<kind>:<workspace>:<id>...`:
//
//   (root) > workspace > space > folder > list > task
//                              > list > task
//                      > Docs > doc > page > page ...
//
// Tasks and Doc pages import; the rest only hold them. Spaces, folders, lists and a Doc's pages
// come whole; a list's tasks page by ClickUp's `page` (100 each), the cursor its number, and the
// Docs by ClickUp's cursor. ClickUp's API has no text search: a search reads the tasks under the
// node (filtered team tasks, a page at a time) or the Docs and pages, and keeps those whose name
// holds it, so a page of matches may hold none, with a cursor to the next.

const KINDS = { workspace: 0, space: 1, folder: 1, list: 1, task: 1, docs: 0, doc: 1, page: 2 };
type Kind = keyof typeof KINDS;
type Node = { kind: Kind; workspace: string; ids: string[] };

function parseNode(id: string): Node {
  const [kind = '', workspace = '', ...ids] = id.split(':');
  if (
    Object.hasOwn(KINDS, kind) &&
    ids.length === KINDS[kind as Kind] &&
    [workspace, ...ids].every((part) => /^[\w-]+$/.test(part))
  )
    return { kind: kind as Kind, workspace, ids };
  throw new MesaError(
    'usage',
    `${id} is not a ClickUp node: take ids from mesa sources browse clickup`,
  );
}

const child = (
  node: Node,
  title: string,
  url: string,
  more: Partial<BrowseChild> = {},
): BrowseChild => ({
  id: [node.kind, node.workspace, ...node.ids].join(':'),
  kind: node.kind,
  title: title || 'Untitled',
  url,
  hasChildren: true,
  importable: false,
  ...more,
});

const named = z.object({ id: z.string(), name: z.string() });
const taskSchema = z.object({ id: z.string(), name: z.string(), custom_id: z.string().nullish() });
const tasksSchema = z.object({ tasks: z.array(taskSchema), last_page: z.boolean().optional() });

const taskChild = (workspace: string, task: z.infer<typeof taskSchema>) =>
  child(
    { kind: 'task', workspace, ids: [task.id] },
    task.custom_id ? `${task.custom_id}: ${task.name}` : task.name,
    clickupUrl({ kind: 'task', id: task.id }),
    { hasChildren: false, importable: true },
  );

/** Whether `title` holds `search`, ignoring case. */
const holds = (title: string, search: string | undefined) =>
  !search || title.toLowerCase().includes(search.toLowerCase());

/** The page number a cursor names: 0 for none. */
const pageOf = (cursor: string | undefined) => {
  const page = Number(cursor ?? 0);
  if (Number.isInteger(page) && page >= 0) return page;
  throw new MesaError('usage', `${cursor} is not a ClickUp cursor`);
};

/**
 * One page of tasks at `path` (a list's, or the Workspace's filtered tasks, `filter` its query),
 * those whose name holds `search` when given; the cursor names the next page.
 */
async function tasks(
  get: Http,
  workspace: string,
  path: string,
  filter: string,
  cursor: string | undefined,
  search?: string,
): Promise<BrowsePage> {
  const page = pageOf(cursor);
  const body = await clickupCall(
    get,
    `${path}?page=${page}&include_closed=true${filter}`,
    tasksSchema,
    `ClickUp tasks at ${path}`,
  );
  const children = body.tasks
    .filter((task) => holds(task.name, search) || holds(task.custom_id ?? '', search))
    .map((task) => taskChild(workspace, task));
  const last = body.last_page ?? body.tasks.length === 0;
  return { children, ...(last ? {} : { cursor: String(page + 1) }) };
}

async function workspaceChildren(get: Http, workspace: string): Promise<BrowsePage> {
  const { spaces } = await clickupCall(
    get,
    `/v2/team/${workspace}/space?archived=false`,
    z.object({ spaces: z.array(named) }),
    `ClickUp Workspace ${workspace}'s spaces`,
  );
  return {
    children: [
      ...spaces.map((s) =>
        child(
          { kind: 'space', workspace, ids: [s.id] },
          s.name,
          `${CLICKUP_WEB}/${workspace}/v/s/${s.id}`,
        ),
      ),
      child({ kind: 'docs', workspace, ids: [] }, 'Docs', `${CLICKUP_WEB}/${workspace}/docs`),
    ],
  };
}

const listChild = (workspace: string, list: z.infer<typeof named>) =>
  child(
    { kind: 'list', workspace, ids: [list.id] },
    list.name,
    `${CLICKUP_WEB}/${workspace}/v/li/${list.id}`,
  );
const listsSchema = z.object({ lists: z.array(named) });

/** A space's folders, then its lists outside any folder. */
async function spaceChildren(get: Http, workspace: string, space: string): Promise<BrowsePage> {
  const what = `ClickUp space ${space}`;
  const { folders } = await clickupCall(
    get,
    `/v2/space/${space}/folder?archived=false`,
    z.object({ folders: z.array(named) }),
    `${what}'s folders`,
  );
  const { lists } = await clickupCall(
    get,
    `/v2/space/${space}/list?archived=false`,
    listsSchema,
    `${what}'s lists`,
  );
  return {
    children: [
      ...folders.map((f) =>
        child(
          { kind: 'folder', workspace, ids: [f.id] },
          f.name,
          `${CLICKUP_WEB}/${workspace}/v/f/${f.id}`,
        ),
      ),
      ...lists.map((list) => listChild(workspace, list)),
    ],
  };
}

const docsSchema = z.object({ docs: z.array(named), next_cursor: z.string().nullish() });

/** One page of the Workspace's Docs, those whose name holds `search` when given. */
async function docs(
  get: Http,
  workspace: string,
  cursor: string | undefined,
  search?: string,
): Promise<BrowsePage> {
  const query = new URLSearchParams({
    limit: String(BROWSE_PAGE_SIZE),
    ...(cursor ? { cursor } : {}),
  });
  const body = await clickupCall(
    get,
    `/v3/workspaces/${workspace}/docs?${query}`,
    docsSchema,
    `ClickUp Workspace ${workspace}'s Docs`,
  );
  const children = body.docs
    .filter((doc) => holds(doc.name, search))
    .map((doc) =>
      child(
        { kind: 'doc', workspace, ids: [doc.id] },
        doc.name,
        `${CLICKUP_WEB}/${workspace}/v/dc/${doc.id}`,
      ),
    );
  return { children, ...(body.next_cursor ? { cursor: body.next_cursor } : {}) };
}

type Listed = { id: string; name?: string | null; pages?: Listed[] | null };
const listedSchema: z.ZodType<Listed> = z.lazy(() =>
  z.object({ id: z.string(), name: z.string().nullish(), pages: z.array(listedSchema).nullish() }),
);

/**
 * A Doc's pages under `page` (its top pages when none), or with `search` every page under it
 * whose name holds it, from the Doc's page listing (one GET).
 */
async function docPages(
  get: Http,
  workspace: string,
  doc: string,
  page: string | undefined,
  search?: string,
): Promise<BrowsePage> {
  const listing = await clickupCall(
    get,
    `/v3/workspaces/${workspace}/docs/${doc}/page_listing`,
    z.array(listedSchema),
    `ClickUp Doc ${doc}'s pages`,
  );
  const all = (pages: Listed[]): Listed[] => pages.flatMap((p) => [p, ...all(p.pages ?? [])]);
  const under = page ? (all(listing).find((p) => p.id === page)?.pages ?? []) : listing;
  const shown = search ? all(under).filter((p) => holds(p.name ?? '', search)) : under;
  return {
    children: shown.map((p) =>
      child(
        { kind: 'page', workspace, ids: [doc, p.id] },
        p.name ?? '',
        clickupUrl({ kind: 'page', workspace, doc, page: p.id }),
        { hasChildren: Boolean(p.pages?.length), importable: true },
      ),
    ),
  };
}

/** The filtered team tasks query that keeps a search under `node`. */
const scope = (node: Node) =>
  ({ space: '&space_ids%5B%5D=', folder: '&project_ids%5B%5D=', list: '&list_ids%5B%5D=' })[
    node.kind as 'space' | 'folder' | 'list'
  ] + node.ids[0];

/**
 * A search under `node`: tasks by name across a Workspace, a space, a folder, or a list; Docs by
 * name under Docs; pages by name in a Doc or under a page. From the root, each Workspace in turn,
 * the cursor `<workspace index>.<its cursor>`.
 */
function searchUnder(
  get: Http,
  sites: Site[],
  node: string | undefined,
  search: string,
  cursor: string | undefined,
): Promise<BrowsePage> {
  if (node === undefined) return searchEach(get, sites, search, cursor);
  const at = parseNode(node);
  const team = `/v2/team/${at.workspace}/task`;
  switch (at.kind) {
    case 'workspace':
      return tasks(get, at.workspace, team, '', cursor, search);
    case 'space':
    case 'folder':
    case 'list':
      return tasks(get, at.workspace, team, scope(at), cursor, search);
    case 'docs':
      return docs(get, at.workspace, cursor, search);
    case 'doc':
    case 'page':
      return docPages(get, at.workspace, at.ids[0] ?? '', at.ids[1], search);
    case 'task':
      return Promise.resolve({ children: [] });
  }
}

async function searchEach(
  get: Http,
  sites: Site[],
  search: string,
  cursor: string | undefined,
): Promise<BrowsePage> {
  const dot = cursor?.indexOf('.') ?? -1;
  const at = cursor ? pageOf(cursor.slice(0, dot < 0 ? undefined : dot)) : 0;
  const site = sites[at];
  if (!site) return { children: [] };
  const inner = dot < 0 ? undefined : cursor?.slice(dot + 1);
  const page = await searchUnder(get, sites, `workspace:${site.id}`, search, inner);
  const next = page.cursor
    ? `${at}.${page.cursor}`
    : at + 1 < sites.length
      ? String(at + 1)
      : undefined;
  return { children: page.children, ...(next ? { cursor: next } : {}) };
}

function workspaceNamed(sites: Site[], id: string) {
  if (sites.some((site) => site.id === id)) return;
  throw new MesaError(
    'not_found',
    `Workspace ${id} is not one of the connected ClickUp Workspaces (${sites.map((s) => s.name).join(', ')}): reconnect with mesa sources connect clickup and pick it`,
  );
}

/**
 * ClickUp's tree: the root lists the connected Workspaces, a Workspace its spaces and its Docs, a
 * space its folders and folderless lists, a folder its lists, a list its tasks (closed ones too),
 * the Docs each Doc, and a Doc or a page its pages. Reads only.
 */
export const clickupTree: SourceTree = async (get, sites, node, { cursor, search }) => {
  if (search) return searchUnder(get, sites, node, search, cursor);
  if (node === undefined) {
    return {
      children: sites.map((site) =>
        child({ kind: 'workspace', workspace: site.id, ids: [] }, site.name, site.url),
      ),
    };
  }
  const at = parseNode(node);
  workspaceNamed(sites, at.workspace);
  const [id = '', page] = at.ids;
  switch (at.kind) {
    case 'workspace':
      return workspaceChildren(get, at.workspace);
    case 'space':
      return spaceChildren(get, at.workspace, id);
    case 'folder': {
      const { lists } = await clickupCall(
        get,
        `/v2/folder/${id}/list?archived=false`,
        listsSchema,
        `ClickUp folder ${id}'s lists`,
      );
      return { children: lists.map((list) => listChild(at.workspace, list)) };
    }
    case 'list':
      return tasks(get, at.workspace, `/v2/list/${id}/task`, '', cursor);
    case 'docs':
      return docs(get, at.workspace, cursor);
    case 'doc':
    case 'page':
      return docPages(get, at.workspace, id, page);
    case 'task':
      return { children: [] };
  }
};
