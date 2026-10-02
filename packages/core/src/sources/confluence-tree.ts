import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { confluenceApi, confluenceSearchApi, pageUrl, siteOrigin } from './atlassian.js';
import { childOf } from './atlassian-nodes.js';
import { BROWSE_PAGE_SIZE, type BrowsePage } from './browse.js';
import type { Site } from './connection.js';

// Confluence's part of Atlassian's tree: a site's spaces, a space's top pages, a page's children,
// and CQL search. Each is one page of BROWSE_PAGE_SIZE, its cursor the one in the API's
// `_links.next`.

/** A list's link to its next page. */
const _links = z.object({ next: z.string().optional() }).optional();
const pagesSchema = z.object({
  results: z.array(
    z.object({ id: z.string(), title: z.string().optional(), type: z.string().optional() }),
  ),
  _links,
});
const spacesSchema = z.object({
  results: z.array(z.object({ id: z.string(), key: z.string(), name: z.string() })),
  _links,
});
const searchSchema = z.object({
  _links,
  results: z.array(
    z.object({
      title: z.string().optional(),
      url: z.string().optional(),
      content: z.object({ id: z.string(), type: z.string(), title: z.string() }).optional(),
    }),
  ),
});
/** A page's space key and id in a search result's URL, `/spaces/<key>/pages/<id>/<title>`. */
const PAGE_PATH = /\/spaces\/([^/]+)\/pages\/(\d+)/;

/** One page of a list at `url`: its body by `schema`, and the cursor its `_links.next` holds. */
async function listed<R>(
  get: Http,
  url: string,
  cursor: string | undefined,
  schema: z.ZodType<{ results: R[]; _links?: { next?: string } | undefined }>,
  what: string,
) {
  const query = `limit=${BROWSE_PAGE_SIZE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const body = await readJson(
    await get(`${url}${url.includes('?') ? '&' : '?'}${query}`),
    schema,
    what,
  );
  const next = body._links?.next;
  const nextCursor = next && new URL(next, 'https://next.invalid').searchParams.get('cursor');
  return { results: body.results, ...(nextCursor ? { cursor: nextCursor } : {}) };
}

const page = (site: Site, key: string, id: string, title: string) =>
  childOf({ kind: 'page', site: site.id, id, key }, title, pageUrl(site, key, id));

/** The site's spaces. */
export async function spaces(get: Http, site: Site, cursor?: string): Promise<BrowsePage> {
  const { results, ...more } = await listed(
    get,
    `${confluenceApi(site.id)}/spaces`,
    cursor,
    spacesSchema,
    'Confluence spaces',
  );
  const children = results.map(({ id, key, name }) =>
    childOf(
      { kind: 'space', site: site.id, id, key },
      name,
      `${siteOrigin(site)}/wiki/spaces/${key}`,
    ),
  );
  return { children, ...more };
}

/**
 * A space's top pages (its homepage, and any page beside it), or a page's children: Confluence's
 * `direct-children`, pages only (folders, whiteboards and the rest are left out). A page always
 * reports children, as these lists say nothing of theirs; one without opens on nothing.
 */
export async function pages(
  get: Http,
  site: Site,
  under: { kind: 'space' | 'page'; id: string; key: string },
  cursor?: string,
): Promise<BrowsePage> {
  const api = confluenceApi(site.id);
  const url =
    under.kind === 'space'
      ? `${api}/spaces/${under.id}/pages?depth=root`
      : `${api}/pages/${under.id}/direct-children`;
  const { results, ...more } = await listed(
    get,
    url,
    cursor,
    pagesSchema,
    `Confluence ${under.kind} ${under.id}'s pages`,
  );
  const children = results
    .filter((r) => (r.type ?? 'page') === 'page')
    .map((r) => page(site, under.key, r.id, r.title ?? r.id));
  return { children, ...more };
}

/** The pages CQL query `cql` finds on the site. */
export async function searchPages(
  get: Http,
  site: Site,
  cql: string,
  cursor?: string,
): Promise<BrowsePage> {
  const { results, ...more } = await listed(
    get,
    `${confluenceSearchApi(site.id)}?cql=${encodeURIComponent(cql)}`,
    cursor,
    searchSchema,
    'Confluence search',
  );
  const children = results.flatMap(({ content, url }) => {
    const [, key, id] = PAGE_PATH.exec(url ?? '') ?? [];
    return content?.type === 'page' && key && id ? [page(site, key, id, content.title)] : [];
  });
  return { children, ...more };
}
