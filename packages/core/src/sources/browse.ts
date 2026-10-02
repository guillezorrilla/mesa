import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Site } from './connection.js';

// Browsing a Source as a tree (CONTEXT.md, Picker): a node's children, one page at a time, each
// an item to import or a container to open. Node ids and cursors are opaque strings the Source's
// tree makes and reads; the root is no node.

/** One child of a node. */
export type BrowseChild = {
  id: string;
  /** What it is, in the Source's words. */
  kind: string;
  title: string;
  /** An item's canonical import URL (links.ts resolves it), or a container's web URL. */
  url: string;
  /** False only when it surely has none; true may open on nothing. */
  hasChildren: boolean;
  /** Whether an import takes it (by its `url`); a container only holds items. */
  importable: boolean;
};

/** One page of a node's children: `cursor` asks for the next, absent at the end. */
export type BrowsePage = { children: BrowseChild[]; cursor?: string };

/** Which children: the page `cursor` names, and those under the node matching `search`. */
export type BrowseQuery = { cursor?: string; search?: string };

/**
 * A Source's tree (its row in SOURCES): `node`'s children, the root's when undefined, over the
 * Source's authorized fetch and the sites its connection reaches. Reads only.
 */
export type SourceTree = (
  get: Http,
  sites: Site[],
  node: string | undefined,
  query: BrowseQuery,
) => Promise<BrowsePage>;

/** How many children one page of a browse asks a Source for. */
export const BROWSE_PAGE_SIZE = 25;

/** How many descendants a walk ticks at most. */
export const DESCENDANTS_CAP = 200;

/**
 * Every node under `node`, breadth first, each page of children followed, up to `cap`; `capped`
 * when it stopped with more left.
 */
export async function descendants(
  tree: SourceTree,
  get: Http,
  sites: Site[],
  node: string | undefined,
  cap = DESCENDANTS_CAP,
): Promise<{ children: BrowseChild[]; capped: boolean }> {
  const found: BrowseChild[] = [];
  const open = [node];
  while (open.length) {
    const next = open.shift();
    let cursor: string | undefined;
    do {
      const page = await tree(get, sites, next, cursor ? { cursor } : {});
      for (const child of page.children) {
        if (found.length === cap) return { children: found, capped: true };
        found.push(child);
        if (child.hasChildren) open.push(child.id);
      }
      cursor = page.cursor;
    } while (cursor);
  }
  return { children: found, capped: false };
}

/** What a browse prints: the node (null for the root), its children, and what more there is. */
export type BrowseResult = BrowsePage & { node: string | null; capped?: boolean };

/**
 * `node`'s children through `tree`: one page of them (BrowseQuery), or with `descendants` every
 * node under it up to DESCENDANTS_CAP (descendants), which takes no cursor or search.
 */
export async function browseNode(
  tree: SourceTree,
  get: Http,
  sites: Site[],
  node: string | undefined,
  query: BrowseQuery & { descendants?: boolean },
): Promise<BrowseResult> {
  const { descendants: all, ...page } = query;
  if (!all) return { node: node ?? null, ...(await tree(get, sites, node, page)) };
  if (page.cursor || page.search) {
    throw new MesaError('usage', 'descendants takes no cursor or search: it walks them all');
  }
  const { children, capped } = await descendants(tree, get, sites, node);
  return { node: node ?? null, children, ...(capped ? { capped } : {}) };
}
