import { MesaError } from '../lib/result.js';
import { truncatedSlug } from '../lib/slug.js';
import { type ProviderId, qualifiedTicket } from '../tickets/provider-id.js';
import { issueUrl, pageUrl } from './atlassian.js';
import { notConnectedError } from './authorized-fetch.js';
import { CLICKUP_HOSTS, CLICKUP_WEB, clickupLink, clickupRef } from './clickup.js';
import type { Site } from './connection.js';
import { GITHUB_HOSTS, githubIssueLink, githubRef, parseGithubKey } from './github.js';
import type { ItemRef } from './items.js';
import { isLinearIdentifier, LINEAR_HOSTS, LINEAR_WEB, linearLink, linearRef } from './linear.js';
import { NOTION_HOSTS, NOTION_ID, notionId, notionUrl } from './notion.js';
import type { SourceId } from './sources.js';

// What a pasted link is (CONTEXT.md, Import): a Jira issue (its URL, or a bare key), a Confluence
// page, a Notion page or database row, a ClickUp task or Doc page, a Linear issue, project or
// document, a GitHub issue (its URL with GitHub connected, or its key owner/repo#123), a ticket id
// (linear:ENG-123, as mesa tickets lists it), or any other public web page. An Atlassian link
// resolves through the connected site its host names, whose cloud id the API calls take; a Linear
// link must name the connected workspace.

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
  const ticket = qualifiedTicket(text);
  if (ticket) {
    if (!ticket.key) throw usage(`${text} names no ticket key`);
    return TICKET_KEYS[ticket.provider](ticket.key, sites);
  }
  if (KEY.test(text)) return TICKET_KEYS[bareKeyProvider(text, sites)](text, sites);
  const key = parseGithubKey(text);
  if (key) {
    if (!sites.github) throw notConnectedError('github');
    return githubRef(key);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw usage(`${text} is not a link or a ticket key`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw usage(`${text} is not a web link: Mesa imports http and https links`);
  }
  url.hash = '';
  if (NOTION_HOSTS.includes(url.host)) return notionRef(url, text, Boolean(sites.notion));
  if (CLICKUP_HOSTS.includes(url.host)) {
    if (!sites.clickup) throw notConnectedError('clickup');
    const link = clickupLink(url);
    if (link) return clickupRef(link);
    throw usage(
      `${text} is not a ClickUp task or Doc page: Mesa imports /t/<task id> and /<workspace>/v/dc/<doc>/<page> links`,
    );
  }
  if (LINEAR_HOSTS.includes(url.host)) return linearRefIn(url, text, sites.linear);
  // Without GitHub connected, an issue link stays the public web page it imported as before.
  const issue = sites.github && GITHUB_HOSTS.includes(url.host) && githubIssueLink(url);
  if (issue) return githubRef(issue);
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
  const jira = ISSUE.exec(url.pathname)?.[1];
  if (jira) return jiraRef(site, jira);
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
 * Which tracker a bare key such as ENG-123 is in: Jira while Atlassian is connected, as before
 * Linear and ClickUp; else the one of those two that is connected. Neither reads as Jira, whose
 * not-connected error says what to do.
 */
function bareKeyProvider(key: string, sites: Sites): ProviderId {
  if (sites.atlassian) return 'jira';
  const [only, ...more] = (['linear', 'clickup'] as const).filter((source) => sites[source]);
  if (more.length) {
    throw usage(
      `${key} could be a Linear or a ClickUp key: pass linear:${key}, clickup:${key} or its link`,
    );
  }
  return only ?? 'jira';
}

type Sites = Partial<Record<SourceId, Site[]>>;

/**
 * The item each tracker's own key names (a ticket id's part after its colon): Jira's on its one
 * site, the others' through their links. Keyed by every ticket provider, so a new tracker adds its
 * row here.
 */
const TICKET_KEYS: Record<ProviderId, (key: string, sites: Sites) => ItemRef> = {
  jira: (key, sites) => {
    if (!KEY.test(key)) throw usage(`${key} is not a Jira issue key`);
    const atlassian = sites.atlassian ?? [];
    const [only, ...more] = atlassian;
    if (!only) throw notConnectedError('atlassian');
    if (more.length) {
      const names = atlassian.map((site) => site.name).join(', ');
      throw usage(`${key} could be on any of ${names}: paste the issue's URL instead`);
    }
    return jiraRef(only, key);
  },
  github: (key, sites) => {
    if (!parseGithubKey(key)) throw usage(`${key} is not a GitHub issue key: owner/repo#123`);
    return resolveLink(key, sites);
  },
  linear: (key, sites) => {
    const [workspace] = sites.linear ?? [];
    if (!workspace) throw notConnectedError('linear');
    if (!isLinearIdentifier(key)) throw usage(`${key} is not a Linear issue identifier`);
    return resolveLink(`${workspace.url}/issue/${key}`, sites);
  },
  clickup: (key, sites) => {
    const workspaces = sites.clickup;
    if (!workspaces) throw notConnectedError('clickup');
    // A custom id (DOCK-112) is read within its Workspace; a plain task id needs none.
    const custom = key.includes('-');
    const [only, ...more] = workspaces;
    if (custom && more.length) {
      const names = workspaces.map((site) => site.name).join(', ');
      throw usage(`${key} could be in any of ${names}: paste the task's link instead`);
    }
    return resolveLink(`${CLICKUP_WEB}/t/${custom && only ? `${only.id}/` : ''}${key}`, sites);
  },
};

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

/**
 * A Linear link's item (linearLink), in the connected workspace its first path part names by URL
 * key: a link to another workspace is refused, as the token reaches only the one picked at sign-in.
 */
function linearRefIn(url: URL, text: string, sites: Site[] | undefined): ItemRef {
  if (!sites) throw notConnectedError('linear');
  const link = linearLink(url);
  if (!link) {
    throw usage(
      `${text} is not a Linear issue, project or document: Mesa imports /<workspace>/issue/<ID>, /project/<slug> and /document/<slug> links`,
    );
  }
  // URL keys are case-insensitive in Linear's links, so a pasted link's case does not matter.
  const workspaceUrl = `${LINEAR_WEB}/${link.workspace}`.toLowerCase();
  if (!sites.some((site) => site.url.toLowerCase() === workspaceUrl)) {
    throw new MesaError(
      'not_found',
      `${link.workspace} is not the connected Linear workspace (${sites.map((s) => s.name).join(', ')}): reconnect with mesa sources connect linear and pick it`,
    );
  }
  return linearRef(link);
}
