import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { BROWSE_PAGE_SIZE, type BrowseChild, type BrowsePage, type SourceTree } from './browse.js';
import type { Site } from './connection.js';
import { linearCall, linearLink, linearPage, linearUrl, PAGE_INFO } from './linear.js';

// Linear's tree, its node ids `<kind>:<id>...`:
//
//   (root) > workspace > team > All issues > issue
//                             > project > issue
//                      > Documents > document
//
// Issues, projects (their description) and documents import; the rest only hold them. Every list
// pages by Linear's cursor, BROWSE_PAGE_SIZE at a time, most recently updated first; a team's first
// page starts with its All issues node, and a workspace's first page ends with Documents. A search
// is Linear's own filter on titles, so every page it answers holds only matches: issues under the
// root, a workspace, a team, All issues, or a project; documents under Documents.

const KINDS = { workspace: 1, team: 2, issues: 2, project: 1, documents: 1, issue: 1, document: 1 };
type Kind = keyof typeof KINDS;
type Node = { kind: Kind; ids: string[] };

function parseNode(id: string): Node {
  const [kind = '', ...ids] = id.split(':');
  if (
    Object.hasOwn(KINDS, kind) &&
    ids.length === KINDS[kind as Kind] &&
    ids.every((part) => /^[\w-]+$/.test(part))
  )
    return { kind: kind as Kind, ids };
  throw new MesaError(
    'usage',
    `${id} is not a Linear node: take ids from mesa sources browse linear`,
  );
}

const child = (
  node: Node,
  title: string,
  url: string,
  more: Partial<BrowseChild> = {},
): BrowseChild => ({
  id: [node.kind, ...node.ids].join(':'),
  kind: node.kind,
  title: title || 'Untitled',
  url,
  hasChildren: true,
  importable: false,
  ...more,
});

/** The canonical URL of the item Linear's own `url` opens, which an import takes. */
const canonical = (url: string) => {
  const link = linearLink(new URL(url));
  return link ? linearUrl(link) : url;
};

/** The variables that ask for the page after `cursor`. */
const after = (cursor: string | undefined) => ({ first: BROWSE_PAGE_SIZE, after: cursor ?? null });
const PAGE = '$first: Int, $after: String';
const PAGED = 'first: $first, after: $after';

/** A page's children, and the cursor of the next when there is one. */
function paged<T>(
  page: { nodes: T[]; pageInfo: { hasNextPage: boolean; endCursor?: string | null } },
  toChild: (node: T) => BrowseChild,
): BrowsePage {
  const next = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
  return { children: page.nodes.map(toChild), ...(next ? { cursor: next } : {}) };
}

const issuesSchema = z.object({
  issues: linearPage(z.object({ identifier: z.string(), title: z.string() })),
});

/** One page of the issues `filter` keeps (an IssueFilter), those whose title holds `search`. */
async function issues(
  get: Http,
  site: Site,
  filter: Record<string, unknown>,
  cursor: string | undefined,
  search?: string,
): Promise<BrowsePage> {
  const { issues: page } = await linearCall(
    get,
    `query Issues($filter: IssueFilter, ${PAGE}) { issues(filter: $filter, ${PAGED}, orderBy: updatedAt) { nodes { identifier title } ${PAGE_INFO} } }`,
    { filter: { ...filter, ...titleHolds(search) }, ...after(cursor) },
    issuesSchema,
    'Linear issues',
  );
  return paged(page, (issue) =>
    child(
      { kind: 'issue', ids: [issue.identifier] },
      `${issue.identifier}: ${issue.title}`,
      `${site.url}/issue/${issue.identifier}`,
      { hasChildren: false, importable: true },
    ),
  );
}

/** The filter part that keeps titles holding `search`, ignoring case; none without one. */
const titleHolds = (search: string | undefined) =>
  search ? { title: { containsIgnoreCase: search } } : {};

const teamsSchema = z.object({
  teams: linearPage(z.object({ id: z.string(), name: z.string(), key: z.string() })),
});

/** The workspace's teams, a page at a time, then on the first page its Documents. */
async function workspaceChildren(get: Http, site: Site, cursor: string | undefined) {
  const { teams } = await linearCall(
    get,
    `query Teams(${PAGE}) { teams(${PAGED}) { nodes { id name key } ${PAGE_INFO} } }`,
    after(cursor),
    teamsSchema,
    'Linear teams',
  );
  const page = paged(teams, (team) =>
    child({ kind: 'team', ids: [team.id, team.key] }, team.name, `${site.url}/team/${team.key}`),
  );
  if (cursor) return page;
  const documents = child({ kind: 'documents', ids: [site.id] }, 'Documents', site.url);
  return { ...page, children: [...page.children, documents] };
}

const projectsSchema = z.object({
  team: z.object({
    projects: linearPage(z.object({ id: z.string(), name: z.string(), url: z.string() })),
  }),
});

/** A team's projects, a page at a time, after its All issues node on the first page. */
async function teamChildren(
  get: Http,
  site: Site,
  [team = '', key = '']: string[],
  cursor: string | undefined,
): Promise<BrowsePage> {
  const { team: found } = await linearCall(
    get,
    `query TeamProjects($team: String!, ${PAGE}) { team(id: $team) { projects(${PAGED}, orderBy: updatedAt) { nodes { id name url } ${PAGE_INFO} } } }`,
    { team, ...after(cursor) },
    projectsSchema,
    `Linear team ${key}'s projects`,
  );
  const page = paged(found.projects, (project) =>
    child({ kind: 'project', ids: [project.id] }, project.name, canonical(project.url), {
      importable: true,
    }),
  );
  if (cursor) return page;
  const all = child(
    { kind: 'issues', ids: [team, key] },
    'All issues',
    `${site.url}/team/${key}/all`,
  );
  return { ...page, children: [all, ...page.children] };
}

const documentsSchema = z.object({
  documents: linearPage(z.object({ id: z.string(), title: z.string(), url: z.string() })),
});

/** One page of the workspace's documents, those whose title holds `search`. */
async function documents(
  get: Http,
  cursor: string | undefined,
  search?: string,
): Promise<BrowsePage> {
  const { documents: page } = await linearCall(
    get,
    `query Documents($filter: DocumentFilter, ${PAGE}) { documents(filter: $filter, ${PAGED}, orderBy: updatedAt) { nodes { id title url } ${PAGE_INFO} } }`,
    { filter: titleHolds(search), ...after(cursor) },
    documentsSchema,
    'Linear documents',
  );
  return paged(page, (doc) =>
    child({ kind: 'document', ids: [doc.id] }, doc.title, canonical(doc.url), {
      hasChildren: false,
      importable: true,
    }),
  );
}

/** The connected workspace, which `workspace:<id>` and `documents:<id>` must name. */
function workspaceNamed(sites: Site[], id: string) {
  const site = sites.find((s) => s.id === id);
  if (site) return site;
  throw new MesaError(
    'not_found',
    `Workspace ${id} is not the connected Linear workspace (${sites.map((s) => s.name).join(', ')}): reconnect with mesa sources connect linear and pick it`,
  );
}

/**
 * Linear's tree: the root lists the connected workspace, a workspace its teams and Documents, a
 * team its All issues and projects, All issues or a project its issues, Documents each document.
 * With `search`, the issues or documents under the node whose title holds it. Reads only.
 */
export const linearTree: SourceTree = async (get, sites, node, { cursor, search }) => {
  const [first] = sites;
  if (!first) return { children: [] };
  if (node === undefined) {
    if (search) return issues(get, first, {}, cursor, search);
    return {
      children: sites.map((site) =>
        child({ kind: 'workspace', ids: [site.id] }, site.name, site.url),
      ),
    };
  }
  const at = parseNode(node);
  const [id = ''] = at.ids;
  switch (at.kind) {
    case 'workspace': {
      const site = workspaceNamed(sites, id);
      return search ? issues(get, site, {}, cursor, search) : workspaceChildren(get, site, cursor);
    }
    case 'team':
      return search
        ? issues(get, first, { team: { id: { eq: id } } }, cursor, search)
        : teamChildren(get, first, at.ids, cursor);
    case 'issues':
      return issues(get, first, { team: { id: { eq: id } } }, cursor, search);
    case 'project':
      return issues(get, first, { project: { id: { eq: id } } }, cursor, search);
    case 'documents':
      workspaceNamed(sites, id);
      return documents(get, cursor, search);
    case 'issue':
    case 'document':
      return { children: [] };
  }
};
