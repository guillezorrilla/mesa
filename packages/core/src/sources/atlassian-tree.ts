import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { quoted, siteOrigin } from './atlassian.js';
import { childOf, parseNode, siteNamed } from './atlassian-nodes.js';
import type { BrowsePage, SourceTree } from './browse.js';
import { pages, searchPages, spaces } from './confluence-tree.js';
import type { Site } from './connection.js';
import { issues, projects } from './jira-tree.js';

/**
 * Atlassian's tree (atlassian-nodes.ts): the root lists the connected sites, a site its
 * Confluence and Jira, and below them spaces and pages, projects and issues. A search looks
 * under the node: page titles by CQL in Confluence, a space, or a page's descendants; issue text
 * by JQL in Jira or a project; both, on every site under it, from a site or the root.
 */
export const atlassianTree: SourceTree = (get, sites, node, { cursor, search }) => {
  if (search) return searchUnder(get, sites, node, search, cursor);
  if (node === undefined) {
    return Promise.resolve({
      children: sites.map((site) => childOf({ kind: 'site', site: site.id }, site.name, site.url)),
    });
  }
  const at = parseNode(node);
  const site = siteNamed(sites, at.site);
  switch (at.kind) {
    case 'site':
      return Promise.resolve({ children: products(site) });
    case 'confluence':
      return spaces(get, site, cursor);
    case 'space':
    case 'page':
      return pages(get, site, at, cursor);
    case 'jira':
      return projects(get, site, cursor);
    case 'project':
      return issues(get, site, `project = ${quoted(at.key)} ORDER BY updated DESC`, cursor);
    case 'issue':
      return Promise.resolve({ children: [] });
  }
};

/** A site's two products, Confluence and Jira. */
const products = (site: Site) => [
  childOf({ kind: 'confluence', site: site.id }, 'Confluence', `${siteOrigin(site)}/wiki`),
  childOf({ kind: 'jira', site: site.id }, 'Jira', `${siteOrigin(site)}/jira`),
];

function searchUnder(
  get: Http,
  sites: Site[],
  node: string | undefined,
  search: string,
  cursor: string | undefined,
): Promise<BrowsePage> {
  const each = (under: Site[]) =>
    searchEach(
      under.flatMap((site) => products(site).map((p) => p.id)),
      cursor,
      (id, next) => searchUnder(get, sites, id, search, next),
    );
  if (node === undefined) return each(sites);
  const at = parseNode(node);
  const site = siteNamed(sites, at.site);
  const title = `type = page and title ~ ${quoted(search)}`;
  const text = `text ~ ${quoted(search)} ORDER BY updated DESC`;
  switch (at.kind) {
    case 'site':
      return each([site]);
    case 'confluence':
      return searchPages(get, site, title, cursor);
    case 'space':
      return searchPages(get, site, `space = ${quoted(at.key)} and ${title}`, cursor);
    case 'page':
      return searchPages(get, site, `ancestor = ${at.id} and ${title}`, cursor);
    case 'jira':
      return issues(get, site, text, cursor);
    case 'project':
      return issues(get, site, `project = ${quoted(at.key)} AND ${text}`, cursor);
    case 'issue':
      return Promise.resolve({ children: [] });
  }
}

/**
 * One search under each of `nodes`, their results one after another. Its cursor holds each
 * search's own, for those with more to come: base64url JSON of `[node, cursor]` pairs, a first
 * page's cursor empty.
 */
async function searchEach(
  nodes: string[],
  cursor: string | undefined,
  search: (node: string, cursor: string | undefined) => Promise<BrowsePage>,
): Promise<BrowsePage> {
  const pending = cursor ? readCursor(cursor) : nodes.map((node): [string, string] => [node, '']);
  const children: BrowsePage['children'] = [];
  const more: [string, string][] = [];
  for (const [node, at] of pending) {
    const page = await search(node, at || undefined);
    children.push(...page.children);
    if (page.cursor) more.push([node, page.cursor]);
  }
  if (!more.length) return { children };
  return { children, cursor: Buffer.from(JSON.stringify(more)).toString('base64url') };
}

function readCursor(cursor: string): [string, string][] {
  try {
    const pairs: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(pairs) &&
      pairs.every(
        (p) => Array.isArray(p) && p.length === 2 && p.every((part) => typeof part === 'string'),
      )
    ) {
      return pairs as [string, string][];
    }
  } catch {}
  throw new MesaError('usage', `${cursor} is not a cursor of this search`);
}
