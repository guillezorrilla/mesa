import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { jiraApi, readItem, siteOf } from './atlassian.js';
import { htmlToMarkdown } from './html-markdown.js';
import type { Item, ItemRef } from './items.js';

const named = z.object({ name: z.string() }).nullish();
const person = z.object({ displayName: z.string(), accountId: z.string().optional() }).nullish();

const issueSchema = z.object({
  key: z.string().optional(),
  fields: z.object({
    summary: z.string(),
    issuetype: named,
    status: z
      .object({ name: z.string(), statusCategory: z.object({ key: z.string() }).optional() })
      .nullish(),
    priority: named,
    assignee: person,
    reporter: person,
    labels: z.array(z.string()).nullish(),
    created: z.string().nullish(),
    updated: z.string().nullish(),
  }),
  renderedFields: z.object({ description: z.string().nullish() }).nullish(),
});

const commentsSchema = z.object({
  total: z.number(),
  comments: z.array(
    z.object({ author: person, created: z.string(), renderedBody: z.string().nullish() }),
  ),
});

/** How many comments one page asks for: Jira's most. */
const PAGE = 100;

/** A Jira issue's fields, description, and every comment, the text as Markdown. */
export type JiraIssue = {
  key: string;
  summary: string;
  type?: string;
  status?: string;
  /** Jira's status category: new (to do), indeterminate (in progress), or done. */
  category?: string;
  priority?: string;
  assignee?: { name: string; accountId?: string };
  reporter?: string;
  labels: string[];
  created?: string;
  updated?: string;
  description: string;
  comments: { author: string; created: string; markdown: string }[];
};

/**
 * Issue `key` on the site with cloud id `site`, every page of its comments followed, its HTML
 * turned into Markdown with links resolved against `url`. Reads only. The one reader both an
 * import and the Tickets tab's ticket panel use.
 */
export async function readJiraIssue(
  get: Http,
  site: string,
  key: string,
  url: string,
): Promise<JiraIssue> {
  const base = `${jiraApi(site)}/issue/${encodeURIComponent(key)}`;
  const what = `Jira issue ${key}`;
  const { fields, renderedFields } = await readItem(
    get,
    `${base}?expand=renderedFields`,
    issueSchema,
    what,
  );
  const comments: z.infer<typeof commentsSchema>['comments'] = [];
  for (let total = 1; comments.length < total; ) {
    const page = await readItem(
      get,
      `${base}/comment?expand=renderedBody&startAt=${comments.length}&maxResults=${PAGE}`,
      commentsSchema,
      `${what}'s comments`,
    );
    if (!page.comments.length) break;
    comments.push(...page.comments);
    total = page.total;
  }
  const optional = <T>(name: string, value: T | null | undefined) =>
    value === null || value === undefined ? {} : { [name]: value };
  return {
    key,
    summary: fields.summary,
    ...optional('type', fields.issuetype?.name),
    ...optional('status', fields.status?.name),
    ...optional('category', fields.status?.statusCategory?.key),
    ...optional('priority', fields.priority?.name),
    ...(fields.assignee
      ? {
          assignee: {
            name: fields.assignee.displayName,
            ...optional('accountId', fields.assignee.accountId),
          },
        }
      : {}),
    ...optional('reporter', fields.reporter?.displayName),
    labels: fields.labels ?? [],
    ...optional('created', fields.created),
    ...optional('updated', fields.updated),
    description: await htmlToMarkdown(renderedFields?.description ?? '', url),
    comments: await Promise.all(
      comments.map(async (c) => ({
        author: c.author?.displayName ?? 'Someone',
        created: c.created,
        markdown: await htmlToMarkdown(c.renderedBody ?? '', url),
      })),
    ),
  };
}

/**
 * A Jira issue as an item: its fields, its description, and every comment, as Markdown
 * (readJiraIssue). Reads only.
 */
export async function jiraIssue(
  get: Http,
  ref: ItemRef,
  previousRevision?: string,
): Promise<Item | undefined> {
  if (previousRevision) {
    const current = await readItem(
      get,
      `${jiraApi(siteOf(ref))}/issue/${encodeURIComponent(ref.id)}?fields=updated`,
      z.object({ fields: z.object({ updated: z.string() }) }),
      `Jira issue ${ref.id}`,
    );
    if (current.fields.updated === previousRevision) return undefined;
  }
  const issue = await readJiraIssue(get, siteOf(ref), ref.id, ref.url);
  const facts = [
    ['Type', issue.type],
    ['Status', issue.status],
    ['Priority', issue.priority],
    ['Assignee', issue.assignee?.name],
    ['Reporter', issue.reporter],
    ['Labels', issue.labels.join(', ')],
    ['Created', issue.created],
    ['Updated', issue.updated],
  ].flatMap(([label, value]) => (value ? [`- ${label}: ${value}`] : []));
  const discussion = issue.comments.map((c) => `### ${c.author}, ${c.created}\n\n${c.markdown}`);
  const sections = [
    facts.join('\n'),
    `## Description\n\n${issue.description || 'None.'}`,
    ...(discussion.length ? [`## Comments\n\n${discussion.join('\n\n')}`] : []),
  ];
  return {
    ...ref,
    title: `${ref.id}: ${issue.summary}`,
    markdown: sections.join('\n\n'),
    ...(issue.updated ? { revision: issue.updated } : {}),
  };
}
