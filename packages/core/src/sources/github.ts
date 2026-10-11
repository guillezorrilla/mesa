import { z } from 'zod';
import { type Http, readJson } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Account, Site } from './connection.js';
import type { ItemRef } from './items.js';

/** GitHub's REST API. */
export const GITHUB_API = 'https://api.github.com';

/** Where GitHub items open on the web. */
export const GITHUB_WEB = 'https://github.com';

/**
 * Where the person installs Mesa's GitHub App on more orgs or repos (or changes which repos it
 * may read): Mesa reads only the repos it is installed on.
 */
export const GITHUB_INSTALL_URL = `${GITHUB_WEB}/apps/mesa-for-tickets/installations/new`;

/** Where GitHub's links point (links.ts). */
export const GITHUB_HOSTS = ['github.com', 'www.github.com'];

/** The REST API version Mesa reads, and the media type GitHub asks for. */
const HEADERS = {
  accept: 'application/vnd.github+json',
  'x-github-api-version': '2022-11-28',
  'user-agent': 'Mesa',
};

/**
 * One call to GitHub's REST API at `path`, its JSON body parsed by `schema`; `body` makes it a
 * POST of JSON. GitHub answers 404 for an item that is gone and for one in a repo the GitHub App
 * is not installed on: both not_found, saying so.
 */
export async function githubCall<T>(
  get: Http,
  path: string,
  schema: z.ZodType<T>,
  what: string,
  body?: unknown,
) {
  const response = await get(`${GITHUB_API}${path}`, {
    headers: { ...HEADERS, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  if (response.status === 404)
    throw new MesaError(
      'not_found',
      `${what} is missing, or in a repo Mesa cannot read: give Mesa access to it on GitHub`,
    );
  return readJson(response, schema, what);
}

/** How many items GitHub answers per page at most. */
export const GITHUB_PAGE = 100;

/** Every page of a GitHub list at `path`, each read by `rows`, 100 a page, up to `max` rows. */
export async function githubPages<T, R>(
  get: Http,
  path: string,
  schema: z.ZodType<T>,
  rows: (page: T) => R[],
  what: string,
  max = 1000,
) {
  const all: R[] = [];
  for (let page = 1; all.length < max; page++) {
    const query = `${path.includes('?') ? '&' : '?'}per_page=${GITHUB_PAGE}&page=${page}`;
    const found = rows(await githubCall(get, `${path}${query}`, schema, what));
    all.push(...found);
    if (found.length < GITHUB_PAGE) break;
  }
  return all.slice(0, max);
}

const userSchema = z.object({
  id: z.number(),
  login: z.string(),
  name: z.string().nullish(),
  email: z.string().nullish(),
});
/** The signed-in GitHub user as the API names them. */
export type GithubUser = z.infer<typeof userSchema>;

/** The signed-in GitHub user, with their login. */
export const githubUser = (get: Http) => githubCall(get, '/user', userSchema, 'GitHub /user');

/** The signed-in GitHub account. */
export async function githubAccount(get: Http): Promise<Account> {
  const user = await githubUser(get);
  return {
    id: String(user.id),
    name: user.name || user.login,
    ...(user.email ? { email: user.email } : {}),
  };
}

/**
 * The one site a GitHub connection reaches: the signed-in account. The repos it reads are the
 * ones the GitHub App is installed on, read live (tickets/github-repos.ts), as they change after
 * signing in.
 */
export async function githubSites(get: Http): Promise<Site[]> {
  const { login } = await githubUser(get);
  return [{ id: login, name: login, url: `${GITHUB_WEB}/${login}` }];
}

/** One issue in one repo. */
export type GithubIssueRef = { owner: string; repo: string; number: number };

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?';
const REPO = '[A-Za-z0-9._-]+';
const KEY = new RegExp(`^(${OWNER})/(${REPO})#(\\d+)$`);
const ITEM = new RegExp(`^(${OWNER})/(${REPO})/(\\d+)$`);
const ISSUE_PATH = new RegExp(`^/(${OWNER})/(${REPO})/issues/(\\d+)/?$`);
const REPO_NAME = new RegExp(`^${OWNER}/${REPO}$`);

const issueOf = (match: RegExpExecArray | null): GithubIssueRef | undefined =>
  match?.[1] && match[2] && match[3]
    ? { owner: match[1], repo: match[2], number: Number(match[3]) }
    : undefined;

/** Whether `name` is a repo's full name, owner/repo. */
export const isRepoName = (name: string) => REPO_NAME.test(name);

/** A GitHub issue's ticket key, owner/repo#123. */
export const githubKey = (issue: GithubIssueRef) => `${issue.owner}/${issue.repo}#${issue.number}`;

/** The issue a ticket key (owner/repo#123) names; undefined when it is none. */
export const parseGithubKey = (key: string) => issueOf(KEY.exec(key.trim()));

/** The issue an imported item's id (owner/repo/123, its folder under raw/github/) names. */
export const parseGithubItem = (id: string) => issueOf(ITEM.exec(id));

/** The issue a github.com URL names (/owner/repo/issues/123); undefined when it is none. */
export const githubIssueLink = (url: URL) => issueOf(ISSUE_PATH.exec(url.pathname));

/** An issue's page on GitHub. */
export const githubIssueUrl = (issue: GithubIssueRef) =>
  `${GITHUB_WEB}/${issue.owner}/${issue.repo}/issues/${issue.number}`;

/** The item an issue is: its folder raw/github/<owner>/<repo>/<number>/, its canonical URL. */
export const githubRef = (issue: GithubIssueRef): ItemRef => ({
  source: 'github',
  id: `${issue.owner}/${issue.repo}/${issue.number}`,
  url: githubIssueUrl(issue),
});

const REMOTE = new RegExp(`github\\.com[:/](${OWNER})/(${REPO}?)(?:\\.git)?/?$`);

/** The repo (owner/repo) a git remote URL on github.com names, https or ssh; undefined for another host. */
export function repoOfRemote(url: string): string | undefined {
  const match = REMOTE.exec(url.trim());
  return match?.[1] && match[2] ? `${match[1]}/${match[2]}` : undefined;
}
