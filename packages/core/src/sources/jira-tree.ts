import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { issueUrl, jiraApi, siteOrigin } from './atlassian.js';
import { childOf } from './atlassian-nodes.js';
import { BROWSE_PAGE_SIZE, type BrowsePage } from './browse.js';
import type { Site } from './connection.js';

// Jira's part of Atlassian's tree: a site's projects (cursor: the next startAt) and the issues a
// JQL query finds (cursor: Jira's nextPageToken), BROWSE_PAGE_SIZE at a time.

const projectsSchema = z.object({
  values: z.array(z.object({ key: z.string(), name: z.string() })),
  startAt: z.number(),
  isLast: z.boolean().optional(),
});
const issuesSchema = z.object({
  issues: z.array(z.object({ key: z.string(), fields: z.object({ summary: z.string() }) })),
  nextPageToken: z.string().nullish(),
  isLast: z.boolean().optional(),
});

/** The site's projects. */
export async function projects(get: Http, site: Site, cursor?: string): Promise<BrowsePage> {
  if (cursor && !/^\d+$/.test(cursor)) {
    throw new MesaError('usage', `${cursor} is not a cursor of Jira's projects`);
  }
  const startAt = cursor ? Number(cursor) : 0;
  const body = await readJson(
    await get(
      `${jiraApi(site.id)}/project/search?startAt=${startAt}&maxResults=${BROWSE_PAGE_SIZE}`,
    ),
    projectsSchema,
    'Jira projects',
  );
  const children = body.values.map(({ key, name }) =>
    childOf({ kind: 'project', site: site.id, key }, name, `${siteOrigin(site)}/browse/${key}`),
  );
  const next = body.startAt + body.values.length;
  return { children, ...(body.isLast || !body.values.length ? {} : { cursor: String(next) }) };
}

/** The issues JQL query `jql` finds on the site; each a leaf, its title as an import names it. */
export async function issues(
  get: Http,
  site: Site,
  jql: string,
  cursor?: string,
): Promise<BrowsePage> {
  const token = cursor ? `&nextPageToken=${encodeURIComponent(cursor)}` : '';
  const body = await readJson(
    await get(
      `${jiraApi(site.id)}/search/jql?jql=${encodeURIComponent(jql)}&fields=summary&maxResults=${BROWSE_PAGE_SIZE}${token}`,
    ),
    issuesSchema,
    'Jira search',
  );
  const children = body.issues.map(({ key, fields }) =>
    childOf(
      { kind: 'issue', site: site.id, key },
      `${key}: ${fields.summary}`,
      issueUrl(site, key),
      false,
    ),
  );
  const next = body.isLast ? undefined : body.nextPageToken;
  return { children, ...(next ? { cursor: next } : {}) };
}
