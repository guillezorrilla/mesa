import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { scopeError } from './authorized-fetch.js';
import type { Account, Site } from './connection.js';
import type { ItemRef } from './items.js';

/** Linear's API: one GraphQL endpoint. */
export const LINEAR_API = 'https://api.linear.app/graphql';

/** Where Linear items open on the web; a workspace's pages are under `<web>/<url key>`. */
export const LINEAR_WEB = 'https://linear.app';

/** Where Linear's links point (links.ts). */
export const LINEAR_HOSTS = ['linear.app'];

const errorsSchema = z
  .array(z.object({ message: z.string(), extensions: z.object({ code: z.string() }).nullish() }))
  .nullish();

/**
 * Linear's answer to a token without the scope a call needs (`Invalid scope: \`write\` required`,
 * as Linear words it): one signed in before Mesa asked for that scope.
 */
const MISSING_SCOPE = /\binvalid scope\b|\bscope\b.*\brequired\b/i;

/**
 * One GraphQL query to Linear's API, its `data` parsed by `schema`. Linear answers an item that is
 * gone, or in a team the person cannot see, with an "Entity not found" error: not_found, saying so.
 * A token that lacks a scope the call needs asks to reconnect (scopeError), the connection kept for
 * the rest. Any other error names `what` and Linear's first message.
 */
export async function linearCall<T>(
  get: Http,
  query: string,
  variables: Record<string, unknown>,
  schema: z.ZodType<T>,
  what: string,
) {
  const response = await get(LINEAR_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body: unknown = await response.json().catch(() => undefined);
  const parsed = z.object({ data: z.unknown(), errors: errorsSchema }).safeParse(body);
  const errors = (parsed.success && parsed.data.errors) || [];
  if (errors.some((e) => /^Entity not found\b/i.test(e.message))) {
    throw new MesaError(
      'not_found',
      `${what} is missing, or not in the connected Linear workspace: reconnect Linear and pick its workspace`,
    );
  }
  if (errors.some((e) => MISSING_SCOPE.test(e.message))) throw scopeError('linear');
  const why = errors[0]?.message ?? (response.ok ? undefined : `HTTP ${response.status}`);
  if (why) throw new MesaError('internal', `${what} answered ${why}`);
  const data = schema.safeParse(parsed.success ? parsed.data.data : undefined);
  if (!data.success) throw new MesaError('internal', `${what} answered an unexpected body`);
  return data.data;
}

/** One page of a Linear list (a GraphQL connection): its nodes and where the next page starts. */
export const linearPage = <T extends z.ZodType>(node: T) =>
  z.object({
    nodes: z.array(node),
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullish() }),
  });

/** The page fields every list query asks for. */
export const PAGE_INFO = 'pageInfo { hasNextPage endCursor }';

const viewerSchema = z.object({
  viewer: z.object({ id: z.string(), name: z.string(), email: z.string().nullish() }),
});

/** The signed-in Linear account. */
export async function linearAccount(get: Http): Promise<Account> {
  const { viewer } = await linearCall(
    get,
    'query Viewer { viewer { id name email } }',
    {},
    viewerSchema,
    'Linear viewer',
  );
  return { id: viewer.id, name: viewer.name, ...(viewer.email ? { email: viewer.email } : {}) };
}

const organizationSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string(), urlKey: z.string() }),
});

/** The workspace the token reaches: a Linear token is one workspace's, picked at sign-in. */
export async function linearSites(get: Http): Promise<Site[]> {
  const { organization: org } = await linearCall(
    get,
    'query Organization { organization { id name urlKey } }',
    {},
    organizationSchema,
    'Linear organization',
  );
  return [{ id: org.id, name: org.name, url: `${LINEAR_WEB}/${org.urlKey}` }];
}

/**
 * What a Linear link names, in the workspace its first path part is the URL key of: an issue by
 * its identifier (`/issue/ENG-123`), or a project or document by its slug (`<title words>-<slug
 * id>`), whose last part is the slug id Linear's API takes.
 */
export type LinearLink = {
  kind: 'issue' | 'project' | 'document';
  workspace: string;
  /** The issue's identifier, or the project's or document's whole slug. */
  slug: string;
};

const LINK = /^\/([\w-]+)\/(issue|project|document)\/([\w-]+)(?:\/|$)/;
const IDENTIFIER = /^[A-Za-z0-9]+-\d+$/;

/** Whether `text` is an issue's identifier: its team's key, a dash, a number (ENG-123). */
export const isLinearIdentifier = (text: string) => IDENTIFIER.test(text);

/** The issue, project, or document `url`'s path names; undefined when it names none. */
export function linearLink(url: URL): LinearLink | undefined {
  const match = LINK.exec(url.pathname);
  const [, workspace, kind, slug] = match ?? [];
  if (!workspace || !slug) return undefined;
  if (kind === 'issue')
    return IDENTIFIER.test(slug) ? { kind, workspace, slug: slug.toUpperCase() } : undefined;
  return { kind: kind as 'project' | 'document', workspace, slug };
}

/** A project's or document's slug id: the last part of its slug. */
export const slugId = (slug: string) => slug.split('-').at(-1) ?? slug;

/** An issue's, project's, or document's canonical URL, which an import takes. */
export const linearUrl = (link: LinearLink) =>
  `${LINEAR_WEB}/${link.workspace}/${link.kind}/${link.slug}`;

/** The item `link` names: an issue's folder is its identifier, the others' `<kind>.<slug id>`. */
export const linearRef = (link: LinearLink): ItemRef => ({
  source: 'linear',
  id: link.kind === 'issue' ? link.slug : `${link.kind}.${slugId(link.slug)}`,
  url: linearUrl(link),
});

/**
 * The id a project or custom view `input` names: its link's slug id (`/<workspace>/project/<slug>`
 * or `/<workspace>/view/<slug>`), else `input` itself, an id or a slug id.
 */
export function linearIdOf(input: string, kind: 'project' | 'view'): string {
  const text = input.trim();
  if (!/^https?:\/\//i.test(text)) return text;
  const url = URL.parse(text);
  const path = url && LINEAR_HOSTS.includes(url.host) ? url.pathname : '';
  const slug = new RegExp(`^/[\\w-]+/${kind}/([\\w-]+)(?:/|$)`).exec(path)?.[1];
  if (!slug) throw new MesaError('usage', `${text} is not a Linear ${kind} link`);
  return slugId(slug);
}
