import { z } from 'zod';
import { htmlToMarkdown } from '../lib/html-markdown.js';
import type { Http } from '../lib/http.js';
import { jiraApi, readItem, siteOf } from './atlassian.js';
import type { Item, ItemRef } from './items.js';

const named = z.object({ name: z.string() }).nullish();
const person = z.object({ displayName: z.string() }).nullish();

const issueSchema = z.object({
  fields: z.object({
    summary: z.string(),
    issuetype: named,
    status: named,
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

/**
 * A Jira issue as an item: its fields, its description from `renderedFields`, and every comment
 * (each page of them followed), as Markdown. Reads only.
 */
export async function jiraIssue(get: Http, ref: ItemRef): Promise<Item> {
  const base = `${jiraApi(siteOf(ref))}/issue/${encodeURIComponent(ref.id)}`;
  const what = `Jira issue ${ref.id}`;
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
  const facts = [
    ['Type', fields.issuetype?.name],
    ['Status', fields.status?.name],
    ['Priority', fields.priority?.name],
    ['Assignee', fields.assignee?.displayName],
    ['Reporter', fields.reporter?.displayName],
    ['Labels', fields.labels?.join(', ')],
    ['Created', fields.created],
    ['Updated', fields.updated],
  ].flatMap(([label, value]) => (value ? [`- ${label}: ${value}`] : []));
  const description = await htmlToMarkdown(renderedFields?.description ?? '', ref.url);
  const discussion = await Promise.all(
    comments.map(
      async (c) =>
        `### ${c.author?.displayName ?? 'Someone'}, ${c.created}\n\n${await htmlToMarkdown(c.renderedBody ?? '', ref.url)}`,
    ),
  );
  const sections = [
    facts.join('\n'),
    `## Description\n\n${description || 'None.'}`,
    ...(discussion.length ? [`## Comments\n\n${discussion.join('\n\n')}`] : []),
  ];
  return { ...ref, title: `${ref.id}: ${fields.summary}`, markdown: sections.join('\n\n') };
}
