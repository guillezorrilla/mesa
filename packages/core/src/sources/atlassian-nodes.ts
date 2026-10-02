import { MesaError } from '../lib/result.js';
import type { BrowseChild } from './browse.js';
import type { Site } from './connection.js';

// The nodes of Atlassian's tree and their ids, `<kind>:<cloud id>` and then what the API calls
// need: a space's or page's id and its space key (pages' URLs and CQL take the key), a project's
// or issue's key. The key comes last, so it may hold anything.
//
//   (root) > site > confluence > space > page > page ...
//                 > jira > project > issue

export type AtlassianNode =
  | { kind: 'site' | 'confluence' | 'jira'; site: string }
  | { kind: 'space' | 'page'; site: string; id: string; key: string }
  | { kind: 'project' | 'issue'; site: string; key: string };

export function nodeId(node: AtlassianNode): string {
  const head = `${node.kind}:${node.site}`;
  if ('id' in node) return `${head}:${node.id}:${node.key}`;
  if ('key' in node) return `${head}:${node.key}`;
  return head;
}

/** The node `id` names; usage when it is none (nodeId's ids only). */
export function parseNode(id: string): AtlassianNode {
  const [kind = '', site = '', ...rest] = id.split(':');
  const bad = () =>
    new MesaError(
      'usage',
      `${id} is not an Atlassian node: take ids from mesa sources browse atlassian`,
    );
  if (!site) throw bad();
  if (kind === 'site' || kind === 'confluence' || kind === 'jira') {
    if (rest.length) throw bad();
    return { kind, site };
  }
  if (kind === 'space' || kind === 'page') {
    const [nodeOf = '', ...key] = rest;
    if (!/^\d+$/.test(nodeOf) || !key.join(':')) throw bad();
    return { kind, site, id: nodeOf, key: key.join(':') };
  }
  if ((kind === 'project' || kind === 'issue') && rest.join(':')) {
    return { kind, site, key: rest.join(':') };
  }
  throw bad();
}

/** `node` as a child in a browse: pages and issues import, the rest only contain them. */
export const childOf = (
  node: AtlassianNode,
  title: string,
  url: string,
  hasChildren = true,
): BrowseChild => ({
  id: nodeId(node),
  kind: node.kind,
  title,
  url,
  hasChildren,
  importable: node.kind === 'page' || node.kind === 'issue',
});

/** The connected site with cloud id `id`; not_found when the connection reaches none. */
export function siteNamed(sites: Site[], id: string): Site {
  const site = sites.find((s) => s.id === id);
  if (site) return site;
  throw new MesaError(
    'not_found',
    `site ${id} is not one of the connected Atlassian sites (${sites.map((s) => s.name).join(', ')})`,
  );
}
