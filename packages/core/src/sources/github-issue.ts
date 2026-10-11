import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import {
  type GithubIssueRef,
  githubCall,
  githubKey,
  githubPages,
  parseGithubItem,
} from './github.js';
import type { Item, ItemRef } from './items.js';

const person = z.object({ id: z.number(), login: z.string() });

/** An issue as GitHub's REST API answers it, with what the Tickets tab and an import read. */
export const githubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullish(),
  state: z.enum(['open', 'closed']),
  html_url: z.string(),
  user: person.nullish(),
  assignees: z.array(person).nullish(),
  labels: z
    .array(z.union([z.string(), z.object({ name: z.string(), color: z.string().nullish() })]))
    .nullish(),
  milestone: z.object({ number: z.number(), title: z.string() }).nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  /** Present on a pull request: GitHub's issue lists hold pull requests too. */
  pull_request: z.unknown().optional(),
});
export type GithubIssue = z.infer<typeof githubIssueSchema>;

/** An issue's labels, each with its color as GitHub's hex (no #) when it has one. */
export const labelsOf = (issue: GithubIssue) =>
  (issue.labels ?? []).map((l) =>
    typeof l === 'string' ? { name: l } : { name: l.name, ...(l.color ? { color: l.color } : {}) },
  );

const commentsSchema = z.array(
  z.object({ user: person.nullish(), created_at: z.string(), body: z.string().nullish() }),
);

/** The issue's path in the API. */
export const issuePath = (issue: GithubIssueRef) =>
  `/repos/${issue.owner}/${issue.repo}/issues/${issue.number}`;

/** Every comment on an issue, oldest first, 100 a page. */
export const githubComments = (get: Http, issue: GithubIssueRef) =>
  githubPages(
    get,
    `${issuePath(issue)}/comments`,
    commentsSchema,
    (page) => page,
    `GitHub issue ${githubKey(issue)}'s comments`,
  );

/**
 * A GitHub issue as an item: its facts, its body (GitHub's Markdown), and every comment. One GET
 * for the issue and one per 100 comments, unless it is unchanged since `previousRevision` (its
 * `updated_at`, which a new comment moves too). Reads only.
 */
export async function githubIssue(
  get: Http,
  ref: ItemRef,
  previousRevision?: string,
): Promise<Item | undefined> {
  const issue = parseGithubItem(ref.id);
  if (!issue) throw new MesaError('usage', `${ref.id} is not a GitHub issue`);
  const key = githubKey(issue);
  const raw = await githubCall(get, issuePath(issue), githubIssueSchema, `GitHub issue ${key}`);
  const revision = raw.updated_at ?? undefined;
  if (revision && revision === previousRevision) return undefined;
  const facts = [
    ['State', raw.state === 'open' ? 'Open' : 'Closed'],
    ['Assignees', raw.assignees?.map((a) => a.login).join(', ')],
    [
      'Labels',
      labelsOf(raw)
        .map((l) => l.name)
        .join(', '),
    ],
    ['Milestone', raw.milestone?.title],
    ['Opened by', raw.user?.login],
    ['Created', raw.created_at],
    ['Updated', raw.updated_at],
  ].flatMap(([label, value]) => (value ? [`- ${label}: ${value}`] : []));
  const discussion = (await githubComments(get, issue)).map(
    (c) => `### ${c.user?.login ?? 'Someone'}, ${c.created_at}\n\n${c.body?.trim() ?? ''}`,
  );
  const sections = [
    facts.join('\n'),
    `## Description\n\n${raw.body?.trim() || 'None.'}`,
    ...(discussion.length ? [`## Comments\n\n${discussion.join('\n\n')}`] : []),
  ];
  return {
    ...ref,
    title: `${key}: ${raw.title}`,
    markdown: sections.join('\n\n'),
    ...(revision ? { revision } : {}),
  };
}
