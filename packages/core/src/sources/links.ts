import { MesaError } from '../lib/result.js';
import { truncatedSlug } from '../projects/slug.js';
import { issueUrl, pageUrl } from './atlassian.js';
import { notConnectedError } from './authorized-fetch.js';
import type { Site } from './connection.js';
import type { ItemRef } from './items.js';
import { NOTION_HOSTS, NOTION_ID, notionId, notionUrl } from './notion.js';
import type { SourceId } from './sources.js';

// What a pasted link is (CONTEXT.md, Import): a Jira issue (its URL, or a bare key), a Confluence
// page, a Notion page or database row, or any other public web page. An Atlassian link resolves
// through the connected site its host names, whose cloud id the API calls take.

const KEY = /^[A-Z][A-Z0-9_]+-\d+$/;
const ISSUE = /^\/browse\/([A-Z][A-Z0-9_]+-\d+)\/?$/;
const PAGE = /^\/wiki\/spaces\/([^/]+)\/pages\/(\d+)(?:\/|$)/;

const usage = (message: string) => new MesaError('usage', message);
const jiraRef = (site: Site, key: string): ItemRef => ({
  source: 'jira',
  id: key,
  url: issueUrl(site, key),
  site: site.id,
});

/** A web URL's item id: its host, path, and query as a slug of at most 80 characters. */
const webId = (url: URL) => truncatedSlug(`${url.host}${url.pathname}${url.search}`);

/**
 * The item `link` names, given the sites each Source's connection reaches (none when it has no
 * connection). A bare key needs exactly one Atlassian site; an Atlassian host that no connection
 * reaches, or a link there that is not an issue or a page, is refused with why.
 */
export function resolveLink(link: string, sites: Partial<Record<SourceId, Site[]>>): ItemRef {
  const text = link.trim();
  const atlassian = sites.atlassian ?? [];
  if (KEY.test(text)) {
    const [only, ...more] = atlassian;
    if (!only) throw notConnectedError('atlassian');
    if (more.length) {
      const names = atlassian.map((site) => site.name).join(', ');
      throw usage(`${text} could be on any of ${names}: paste the issue's URL instead`);
    }
    return jiraRef(only, text);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw usage(`${text} is not a link or a Jira issue key`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw usage(`${text} is not a web link: Mesa imports http and https links`);
  }
  url.hash = '';
  if (NOTION_HOSTS.includes(url.host)) return notionRef(url, text, Boolean(sites.notion));
  const site = atlassian.find((s) => new URL(s.url).host === url.host);
  if (!site) {
    if (!url.host.endsWith('.atlassian.net')) {
      return { source: 'web', id: webId(url), url: url.href };
    }
    if (!sites.atlassian) throw notConnectedError('atlassian');
    throw new MesaError(
      'not_found',
      `${url.host} is not one of the connected Atlassian sites (${atlassian.map((s) => s.name).join(', ')}): reconnect with mesa sources connect atlassian and choose it`,
    );
  }
  const issue = ISSUE.exec(url.pathname)?.[1];
  if (issue) return jiraRef(site, issue);
  const page = PAGE.exec(url.pathname);
  if (page?.[1] && page[2]) {
    return {
      source: 'confluence',
      id: page[2],
      url: pageUrl(site, page[1], page[2]),
      site: site.id,
    };
  }
  throw usage(
    `${text} is not a Jira issue or a Confluence page: Mesa imports /browse/<KEY> and /wiki/spaces/<space>/pages/<id> links`,
  );
}

/**
 * A Notion link's page: the one it opens over a database (`?p=<id>`), else the one its path ends
 * in (`/<workspace>/<Title-words>-<id>`, `/<id>`, `/p/<id>`), dashed or not. Any other query
 * (`?pvs=`, `?v=`) is a view's, and left out.
 */
function notionRef(url: URL, text: string, connected: boolean): ItemRef {
  if (!connected) throw notConnectedError('notion');
  const last = url.pathname.split('/').at(-1) ?? '';
  const id = [url.searchParams.get('p') ?? '', last]
    .map((part) => NOTION_ID.exec(part.replaceAll('-', ''))?.[1])
    .find(Boolean);
  if (!id) throw usage(`${text} is not a Notion page: Mesa imports links that end in its id`);
  return { source: 'notion', id: notionId(id), url: notionUrl(id) };
}
