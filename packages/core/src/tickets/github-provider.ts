import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import type { Account } from '../sources/connection.js';
import {
  GITHUB_INSTALL_URL,
  type GithubIssueRef,
  type GithubUser,
  githubCall,
  githubKey,
  githubPages,
  githubUser,
  isRepoName,
  parseGithubKey,
} from '../sources/github.js';
import {
  type GithubIssue,
  githubComments,
  githubIssueSchema,
  issuePath,
  labelsOf,
} from '../sources/github-issue.js';
import { githubRepos } from '../sources/github-repos.js';
import { type GithubView, type GithubViewInput, GithubViewSchema } from './github-view.js';
import type { TicketView, ViewInput } from './providers.js';
import { type ProviderDeps, type ProviderTicket, parseWith, type TicketProvider } from './provider.js';

/** How many issues one read lists: one page of GitHub's. */
const ISSUES = 100;

/** A GitHub issue whole, as its ticket panel shows it. */
export type GithubDetail = {
  key: string;
  summary: string;
  status: string;
  category: ProviderTicket['category'];
  /** The first assignee, as every panel names one. */
  assignee?: { name: string; accountId: string };
  assignees: { name: string; accountId: string }[];
  labels: { name: string; color?: string }[];
  milestone?: string;
  repository: string;
  description: string;
  comments: { author: string; created: string; markdown: string }[];
};

const milestonesSchema = z.array(z.object({ number: z.number(), title: z.string() }));
const labelsSchema = z.array(z.object({ name: z.string(), color: z.string().nullish() }));

const state = (issue: GithubIssue) =>
  issue.state === 'open'
    ? ({ status: 'Open', category: 'new' } as const)
    : ({ status: 'Closed', category: 'done' } as const);
const people = (issue: GithubIssue) =>
  (issue.assignees ?? []).map((a) => ({ name: a.login, accountId: String(a.id) }));

/**
 * GitHub's row of the ticket providers: views over one repo's issues (pull requests left out),
 * narrowed by labels, a milestone, whose and whether closed, on the repos Mesa's GitHub App is
 * installed on; and the repos, labels and milestones its Follow dialog picks from.
 */
export function githubProvider(deps: ProviderDeps) {
  const get = () => deps.fetch('github');
  let viewer: Promise<GithubUser> | undefined;
  /** The signed-in user, read once; a failed read is not kept. */
  const me = () => {
    viewer ??= githubUser(get()).catch((error: unknown) => {
      viewer = undefined;
      throw error;
    });
    return viewer;
  };
  const milestones = (repo: string) =>
    githubPages(get(), `/repos/${repo}/milestones?state=all`, milestonesSchema, (p) => p, `GitHub ${repo}'s milestones`);

  /** `input`'s milestone as a view keeps it: a number, `none`, or a title found in the repo. */
  const milestoneOf = async (repo: string, input: string | undefined, check: boolean) => {
    if (input === undefined) return {};
    if (input.trim().toLowerCase() === 'none') return { milestone: 'none' as const };
    const number = /^\d+$/.test(input.trim()) ? Number(input) : undefined;
    if (number !== undefined && !check) return { milestone: number };
    const found = (await milestones(repo)).find(
      (m) => m.number === number || m.title.toLowerCase() === input.trim().toLowerCase(),
    );
    if (!found) throw new MesaError('usage', `${repo} has no milestone ${input}`);
    return { milestone: found.number, milestoneTitle: found.title };
  };

  /** The request a view sends, its path with its query. */
  const request = async (view: GithubView) => {
    const query = new URLSearchParams({ state: view.showDone ? 'all' : 'open' });
    if (!view.everyone) query.set('assignee', (await me()).login);
    if (view.labels) query.set('labels', view.labels.join(','));
    if (view.milestone !== undefined) query.set('milestone', String(view.milestone));
    return `/repos/${view.repo}/issues?${query}`;
  };

  const issueOf = (key: string): GithubIssueRef => {
    const issue = parseGithubKey(key);
    if (!issue) throw new MesaError('usage', `${key} is not a GitHub issue key, owner/repo#123`);
    return issue;
  };

  const row: TicketProvider<ViewInput, TicketView, GithubDetail> = {
    /** `input` on its repo, the project's origin remote's when it names none; checking it reads the repo. */
    view: async (input: GithubViewInput, check: boolean) => {
      const { project, repo: named, milestone, provider: _, ...rest } = input;
      const repo = named?.trim() || (project ? await deps.origin(project) : undefined);
      if (!repo)
        throw new MesaError(
          'usage',
          `pass --repo owner/repo${project ? `: ${project} has no origin remote on github.com` : ''}`,
        );
      if (!isRepoName(repo)) throw new MesaError('usage', `${repo} is not a repo: owner/repo`);
      if (check) await githubCall(get(), `/repos/${repo}`, z.object({}), `GitHub repo ${repo}`);
      return parseWith(GithubViewSchema, {
        ...rest,
        provider: 'github',
        repo,
        ...(await milestoneOf(repo, milestone, check)),
      });
    },
    read: async (view: GithubView) => {
      const path = await request(view);
      const found = await githubCall(
        get(),
        `${path}&per_page=${ISSUES}`,
        z.array(githubIssueSchema),
        `GitHub ${view.repo}'s issues`,
      );
      const [owner = '', repo = ''] = view.repo.split('/');
      const tickets = found
        .filter((issue) => issue.pull_request === undefined)
        .map((issue): ProviderTicket => {
          const assignees = people(issue).map((a) => ({ id: a.accountId, name: a.name }));
          const first = assignees[0];
          return {
            key: githubKey({ owner, repo, number: issue.number }),
            summary: issue.title,
            ...state(issue),
            ...(first ? { assignee: first.name, assigneeId: first.id } : {}),
            assignees,
            url: issue.html_url,
          };
        });
      // ponytail: one page of 100; "that many or more" is enough for a count.
      return { tickets, query: `GET ${path}`, more: found.length >= ISSUES };
    },
    key: (input) => githubKey(issueOf(input)),
    show: async (key) => {
      const issue = issueOf(key);
      const [raw, comments, user] = await Promise.all([
        githubCall(get(), issuePath(issue), githubIssueSchema, `GitHub issue ${key}`),
        githubComments(get(), issue),
        me(),
      ]);
      const assignees = people(raw);
      return {
        key: githubKey(issue),
        summary: raw.title,
        ...state(raw),
        ...(assignees[0] ? { assignee: assignees[0] } : {}),
        assignees,
        labels: labelsOf(raw),
        ...(raw.milestone ? { milestone: raw.milestone.title } : {}),
        repository: `${issue.owner}/${issue.repo}`,
        description: raw.body ?? '',
        comments: comments.map((c) => ({
          author: c.user?.login ?? 'Someone',
          created: c.created_at,
          markdown: c.body ?? '',
        })),
        url: raw.html_url,
        mine: assignees.some((a) => a.accountId === String(user.id)),
      };
    },
    me: async (): Promise<Account> => {
      const user = await me();
      return { id: String(user.id), name: user.name || user.login };
    },
    place: async () => 'GitHub',
    /** Mesa's one write to GitHub: adds the person beside the issue's other assignees. */
    assign: async (key) => {
      const issue = issueOf(key);
      const { login, name } = await me();
      const after = await githubCall(
        get(),
        `${issuePath(issue)}/assignees`,
        githubIssueSchema,
        `Assigning ${key}`,
        { assignees: [login] },
      );
      // GitHub drops, without an error, an assignee who cannot be assigned in the repo.
      if (!after.assignees?.some((a) => a.login === login))
        throw new MesaError(
          'usage',
          `GitHub did not add you to ${key}: only people with access to ${issue.owner}/${issue.repo} can be assigned`,
        );
      return { assignee: name || login };
    },
  };

  return {
    ...row,
    /**
     * The repos Mesa can read, `project`'s origin remote's first when it is one of them, and where
     * the person gives Mesa access to more.
     */
    repos: async (project?: string) => {
      const [repos, origin] = await Promise.all([
        githubRepos(get()),
        project ? deps.origin(project) : undefined,
      ]);
      const marked = repos.map((r) => ({ ...r, origin: r.fullName === origin }));
      return {
        repos: [...marked.filter((r) => r.origin), ...marked.filter((r) => !r.origin)],
        install: GITHUB_INSTALL_URL,
      };
    },
    /** The labels and open milestones of `repo`, which a GitHub view narrows by. */
    repo: async (repo: string) => {
      if (!isRepoName(repo)) throw new MesaError('usage', `${repo} is not a repo: owner/repo`);
      const [labels, open] = await Promise.all([
        githubPages(get(), `/repos/${repo}/labels`, labelsSchema, (p) => p, `GitHub ${repo}'s labels`),
        githubPages(get(), `/repos/${repo}/milestones?state=open`, milestonesSchema, (p) => p, `GitHub ${repo}'s milestones`),
      ]);
      return {
        repo,
        labels: labels.map((l) => ({ name: l.name, ...(l.color ? { color: l.color } : {}) })),
        milestones: open,
      };
    },
  };
}
