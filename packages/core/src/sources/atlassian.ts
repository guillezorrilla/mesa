import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { type Account, distinctSites, type Site } from './connection.js';
import type { ItemRef } from './items.js';

const API = 'https://api.atlassian.com';

const meSchema = z.object({
  account_id: z.string(),
  name: z.string(),
  email: z.string().optional(),
});
const resourcesSchema = z.array(z.object({ id: z.string(), name: z.string(), url: z.string() }));

/** The signed-in Atlassian account. */
export async function atlassianAccount(get: Http): Promise<Account> {
  const { account_id, name, email } = await readJson(
    await get(`${API}/me`),
    meSchema,
    'Atlassian /me',
  );
  return { id: account_id, name, ...(email ? { email } : {}) };
}

/** The Atlassian sites (cloud ids) the token reaches. */
export async function atlassianSites(get: Http): Promise<Site[]> {
  const sites = await readJson(
    await get(`${API}/oauth/token/accessible-resources`),
    resourcesSchema,
    'Atlassian accessible-resources',
  );
  return distinctSites(sites.map(({ id, name, url }) => ({ id, name, url })));
}

/** Jira's REST API (v3) on the site with cloud id `site`. */
export const jiraApi = (site: string) => `${API}/ex/jira/${site}/rest/api/3`;
/** Jira Software's REST API (boards and sprints) on the site with cloud id `site`. */
export const jiraAgileApi = (site: string) => `${API}/ex/jira/${site}/rest/agile/1.0`;
/** Confluence's REST API (v2) on the site with cloud id `site`. */
export const confluenceApi = (site: string) => `${API}/ex/confluence/${site}/wiki/api/v2`;
/** Confluence's older REST API (v1), which alone has CQL search, on the site with cloud id `site`. */
export const confluenceSearchApi = (site: string) =>
  `${API}/ex/confluence/${site}/wiki/rest/api/search`;

/** A site's web address, with no trailing slash. */
export const siteOrigin = (site: Site) => site.url.replace(/\/+$/, '');
/** A Jira issue's canonical URL, which an import takes. */
export const issueUrl = (site: Site, key: string) => `${siteOrigin(site)}/browse/${key}`;
/** A Confluence page's canonical URL, which an import takes. */
export const pageUrl = (site: Site, space: string, id: string) =>
  `${siteOrigin(site)}/wiki/spaces/${space}/pages/${id}`;

/** `text` as a JQL or CQL string literal. */
export const quoted = (text: string) => `"${text.replace(/["\\]/g, '\\$&')}"`;

/** The cloud id of the site an Atlassian item lives on (links.ts sets it). */
export function siteOf(ref: ItemRef): string {
  if (!ref.site) throw new MesaError('internal', `${ref.url} names no Atlassian site`);
  return ref.site;
}

/**
 * A GET of `what` on an Atlassian API, its JSON body parsed by `schema`. Atlassian answers 404 or
 * 403 for an item that is gone or that the person cannot see: not_found, saying so.
 */
export async function readItem<T>(get: Http, url: string, schema: z.ZodType<T>, what: string) {
  const response = await get(url);
  if (response.status === 404 || response.status === 403) {
    throw new MesaError('not_found', `${what} is missing, or not shared with you`);
  }
  return readJson(response, schema, what);
}
