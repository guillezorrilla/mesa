import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { type ClickupLink, clickupCall, clickupLink } from './clickup.js';
import type { Item, ItemRef } from './items.js';

/** ClickUp's times: Unix milliseconds, as a string or a number. */
const millis = z.union([z.string(), z.number()]).nullish();
const iso = (ms: z.infer<typeof millis>) => (ms ? new Date(Number(ms)).toISOString() : undefined);

const taskSchema = z.object({
  id: z.string(),
  custom_id: z.string().nullish(),
  name: z.string(),
  markdown_description: z.string().nullish(),
  status: z.object({ status: z.string() }).nullish(),
  list: z.object({ name: z.string() }).nullish(),
  assignees: z.array(z.object({ username: z.string().nullish() })).nullish(),
  tags: z.array(z.object({ name: z.string() })).nullish(),
  date_created: millis,
  date_updated: millis,
});

const commentsSchema = z.object({
  comments: z.array(
    z.object({
      id: z.string(),
      comment_text: z.string(),
      user: z.object({ username: z.string().nullish() }).nullish(),
      date: z.string(),
    }),
  ),
});
/** How many comments ClickUp answers at a time, newest first. */
const COMMENTS_PAGE = 25;

/** The query that names a task by its custom id in its Workspace; none for a plain id. */
const custom = (link: Extract<ClickupLink, { kind: 'task' }>) =>
  link.workspace ? `custom_task_ids=true&team_id=${link.workspace}` : '';

/** Every comment on a task, oldest first: ClickUp answers 25 at a time, newest first. */
async function comments(get: Http, link: Extract<ClickupLink, { kind: 'task' }>, what: string) {
  const all: z.infer<typeof commentsSchema>['comments'] = [];
  for (;;) {
    const last = all.at(-1);
    const query = [custom(link), last ? `start=${last.date}&start_id=${last.id}` : '']
      .filter(Boolean)
      .join('&');
    const path = `/v2/task/${link.id}/comment${query ? `?${query}` : ''}`;
    const page = await clickupCall(get, path, commentsSchema, `${what}'s comments`);
    all.push(...page.comments);
    if (page.comments.length < COMMENTS_PAGE) return all.reverse();
  }
}

/**
 * A ClickUp task as an item: its facts, its description as ClickUp's own Markdown, and every
 * comment. One GET for the task, and one per 25 comments, unless it is unchanged since
 * `previousRevision` (its `date_updated`).
 */
async function task(
  get: Http,
  ref: ItemRef,
  link: Extract<ClickupLink, { kind: 'task' }>,
  previousRevision?: string,
): Promise<Item | undefined> {
  const what = `ClickUp task ${link.id}`;
  const query = ['include_markdown_description=true', custom(link)].filter(Boolean).join('&');
  const raw = await clickupCall(get, `/v2/task/${link.id}?${query}`, taskSchema, what);
  const revision = raw.date_updated ? String(raw.date_updated) : undefined;
  if (revision && revision === previousRevision) return undefined;
  const facts = [
    ['Status', raw.status?.status],
    ['List', raw.list?.name],
    ['Assignees', raw.assignees?.flatMap((a) => (a.username ? [a.username] : [])).join(', ')],
    ['Tags', raw.tags?.map((t) => t.name).join(', ')],
    ['Created', iso(raw.date_created)],
    ['Updated', iso(raw.date_updated)],
  ].flatMap(([label, value]) => (value ? [`- ${label}: ${value}`] : []));
  const discussion = (await comments(get, link, what)).map(
    (c) => `### ${c.user?.username ?? 'Someone'}, ${iso(c.date)}\n\n${c.comment_text.trim()}`,
  );
  const sections = [
    facts.join('\n'),
    `## Description\n\n${raw.markdown_description?.trim() || 'None.'}`,
    ...(discussion.length ? [`## Comments\n\n${discussion.join('\n\n')}`] : []),
  ];
  return {
    ...ref,
    title: raw.custom_id ? `${raw.custom_id}: ${raw.name}` : raw.name,
    markdown: sections.join('\n\n'),
    ...(revision ? { revision } : {}),
  };
}

const pageSchema = z.object({
  name: z.string().nullish(),
  content: z.string().nullish(),
  date_updated: millis,
});

/** A ClickUp Doc page as an item: its content as ClickUp's Markdown. One GET (v3). */
async function docPage(
  get: Http,
  ref: ItemRef,
  link: Extract<ClickupLink, { kind: 'page' }>,
  previousRevision?: string,
): Promise<Item | undefined> {
  const path = `/v3/workspaces/${link.workspace}/docs/${link.doc}/pages/${link.page}?content_format=text/md`;
  const page = await clickupCall(get, path, pageSchema, `ClickUp Doc page ${link.page}`);
  const revision = page.date_updated ? String(page.date_updated) : undefined;
  if (revision && revision === previousRevision) return undefined;
  return {
    ...ref,
    title: page.name || 'Untitled',
    markdown: page.content?.trim() ?? '',
    ...(revision ? { revision } : {}),
  };
}

/** A ClickUp task or Doc page, as its canonical URL names it (clickupLink). Reads only. */
export function clickupItem(get: Http, ref: ItemRef, previousRevision?: string) {
  const link = clickupLink(new URL(ref.url));
  if (!link) throw new MesaError('usage', `${ref.url} is not a ClickUp task or Doc page`);
  return link.kind === 'task'
    ? task(get, ref, link, previousRevision)
    : docPage(get, ref, link, previousRevision);
}
