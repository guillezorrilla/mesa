import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { BROWSE_PAGE_SIZE, type BrowseChild, type SourceTree } from './browse.js';
import { githubCall, githubIssueUrl, githubKey, isRepoName } from './github.js';
import { githubIssueSchema } from './github-issue.js';
import { githubRepos } from './github-repos.js';

// GitHub's tree, its node ids `repo:<owner>/<repo>`:
//
//   (root) > repo > issue
//
// The root lists the repos Mesa's GitHub App reads (githubRepos), whole; a repo its open issues,
// pull requests left out, a page of 25 at a time by GitHub's `page`, the cursor its number.
// Issues import; repos only hold them. A search keeps the repos or issues whose name holds it.

/** Whether `title` holds `search`, ignoring case. */
const holds = (title: string, search: string | undefined) =>
  !search || title.toLowerCase().includes(search.toLowerCase());

const repoOf = (node: string) => {
  const name = node.startsWith('repo:') ? node.slice(5) : '';
  if (isRepoName(name)) return name;
  throw new MesaError('usage', `${node} is not a GitHub node: take ids from mesa sources browse github`);
};

const pageOf = (cursor: string | undefined) => {
  const page = Number(cursor ?? 1);
  if (Number.isInteger(page) && page >= 1) return page;
  throw new MesaError('usage', `${cursor} is not a GitHub cursor`);
};

async function issues(get: Http, repo: string, cursor?: string, search?: string) {
  const page = pageOf(cursor);
  const found = await githubCall(
    get,
    `/repos/${repo}/issues?state=open&per_page=${BROWSE_PAGE_SIZE}&page=${page}`,
    z.array(githubIssueSchema),
    `GitHub ${repo}'s issues`,
  );
  const [owner = '', name = ''] = repo.split('/');
  const children = found
    .filter((issue) => issue.pull_request === undefined && holds(issue.title, search))
    .map((issue): BrowseChild => {
      const ref = { owner, repo: name, number: issue.number };
      return {
        id: `issue:${githubKey(ref)}`,
        kind: 'issue',
        title: `#${issue.number} ${issue.title}`,
        url: githubIssueUrl(ref),
        hasChildren: false,
        importable: true,
      };
    });
  return {
    children,
    ...(found.length === BROWSE_PAGE_SIZE ? { cursor: String(page + 1) } : {}),
  };
}

/** GitHub's tree for the Picker: repos, then their open issues. */
export const githubTree: SourceTree = async (get, _sites, node, query) => {
  if (node !== undefined) return issues(get, repoOf(node), query.cursor, query.search);
  const repos = await githubRepos(get);
  return {
    children: repos
      .filter((r) => holds(r.fullName, query.search))
      .map((r) => ({
        id: `repo:${r.fullName}`,
        kind: 'repo',
        title: r.fullName,
        url: r.url,
        hasChildren: true,
        importable: false,
      })),
  };
};
