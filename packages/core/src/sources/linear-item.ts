import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import type { Item, ItemRef } from './items.js';
import {
  type LinearLink,
  linearCall,
  linearLink,
  linearPage,
  PAGE_INFO,
  slugId,
} from './linear.js';

/** How many comments one query asks Linear for. */
const COMMENTS_PAGE = 50;

const named = z.object({ name: z.string() }).nullish();
/** A page of an issue's comments, as COMMENTS asks for it. */
export const commentsSchema = linearPage(
  z.object({ body: z.string(), createdAt: z.string(), user: named }),
);
/** An issue's first page of comments, in a query that takes `$after: String`. */
export const COMMENTS = `comments(first: ${COMMENTS_PAGE}, after: $after) { nodes { body createdAt user { name } } ${PAGE_INFO} }`;

const issueSchema = z.object({
  issue: z.object({
    identifier: z.string(),
    title: z.string(),
    description: z.string().nullish(),
    updatedAt: z.string(),
    createdAt: z.string(),
    priorityLabel: z.string().nullish(),
    estimate: z.number().nullish(),
    dueDate: z.string().nullish(),
    state: named,
    team: named,
    project: named,
    cycle: z.object({ number: z.number(), name: z.string().nullish() }).nullish(),
    assignee: named,
    labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
    comments: commentsSchema,
  }),
});

const ISSUE = `query Issue($id: String!, $after: String) { issue(id: $id) {
  identifier title description updatedAt createdAt priorityLabel estimate dueDate
  state { name } team { name } project { name } cycle { number name } assignee { name }
  labels { nodes { name } } ${COMMENTS} } }`;
const ISSUE_COMMENTS = `query IssueComments($id: String!, $after: String) { issue(id: $id) { ${COMMENTS} } }`;

/**
 * Every comment of issue `id` (`what` names it), oldest first: its first page `first`, read with
 * the issue, then one query per 50 more.
 */
export async function allComments(
  get: Http,
  id: string,
  first: z.infer<typeof commentsSchema>,
  what: string,
) {
  const comments = [...first.nodes];
  let page = first.pageInfo;
  while (page.hasNextPage && page.endCursor) {
    const next = await linearCall(
      get,
      ISSUE_COMMENTS,
      { id, after: page.endCursor },
      z.object({ issue: z.object({ comments: commentsSchema }) }),
      `${what}'s comments`,
    );
    comments.push(...next.issue.comments.nodes);
    page = next.issue.comments.pageInfo;
  }
  return comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** `- Label: value` lines for the facts that have a value. */
const facts = (pairs: [string, string | number | null | undefined][]) =>
  pairs.flatMap(([label, value]) => (value || value === 0 ? [`- ${label}: ${value}`] : []));

/**
 * A Linear issue as an item: its facts, its description (Linear's Markdown), and every comment,
 * oldest first. One query, and one more per 50 comments, unless it is unchanged since
 * `previousRevision` (its `updatedAt`).
 */
async function issue(get: Http, ref: ItemRef, id: string, previousRevision?: string) {
  const what = `Linear issue ${id}`;
  const { issue: raw } = await linearCall(get, ISSUE, { id }, issueSchema, what);
  if (raw.updatedAt === previousRevision) return undefined;
  const comments = await allComments(get, id, raw.comments, what);
  const cycle = raw.cycle && (raw.cycle.name || `Cycle ${raw.cycle.number}`);
  const sections = [
    facts([
      ['Status', raw.state?.name],
      ['Team', raw.team?.name],
      ['Project', raw.project?.name],
      ['Cycle', cycle],
      ['Assignee', raw.assignee?.name],
      ['Priority', raw.priorityLabel],
      ['Estimate', raw.estimate],
      ['Labels', raw.labels.nodes.map((l) => l.name).join(', ')],
      ['Due', raw.dueDate],
      ['Created', raw.createdAt],
      ['Updated', raw.updatedAt],
    ]).join('\n'),
    `## Description\n\n${raw.description?.trim() || 'None.'}`,
    ...(comments.length
      ? [
          `## Comments\n\n${comments
            .map((c) => `### ${c.user?.name ?? 'Someone'}, ${c.createdAt}\n\n${c.body.trim()}`)
            .join('\n\n')}`,
        ]
      : []),
  ];
  return {
    ...ref,
    title: `${raw.identifier}: ${raw.title}`,
    markdown: sections.join('\n\n'),
    revision: raw.updatedAt,
  };
}

const projectSchema = z.object({
  project: z.object({
    name: z.string(),
    description: z.string().nullish(),
    content: z.string().nullish(),
    updatedAt: z.string(),
    status: named,
    lead: named,
    startDate: z.string().nullish(),
    targetDate: z.string().nullish(),
    teams: z.object({ nodes: z.array(z.object({ name: z.string() })) }),
  }),
});

const PROJECT = `query Project($id: String!) { project(id: $id) {
  name description content updatedAt status { name } lead { name } startDate targetDate
  teams { nodes { name } } } }`;

/** A Linear project as an item: its facts, its summary, and its description. One query. */
async function project(get: Http, ref: ItemRef, id: string, previousRevision?: string) {
  const { project: raw } = await linearCall(
    get,
    PROJECT,
    { id },
    projectSchema,
    `Linear project ${id}`,
  );
  if (raw.updatedAt === previousRevision) return undefined;
  const sections = [
    facts([
      ['Status', raw.status?.name],
      ['Lead', raw.lead?.name],
      ['Teams', raw.teams.nodes.map((t) => t.name).join(', ')],
      ['Start', raw.startDate],
      ['Target', raw.targetDate],
      ['Updated', raw.updatedAt],
    ]).join('\n'),
    ...(raw.description?.trim() ? [`## Summary\n\n${raw.description.trim()}`] : []),
    `## Description\n\n${raw.content?.trim() || 'None.'}`,
  ];
  return { ...ref, title: raw.name, markdown: sections.join('\n\n'), revision: raw.updatedAt };
}

const documentSchema = z.object({
  document: z.object({ title: z.string(), content: z.string().nullish(), updatedAt: z.string() }),
});

/** A Linear document as an item: its content as Linear's Markdown. One query. */
async function document(get: Http, ref: ItemRef, id: string, previousRevision?: string) {
  const { document: raw } = await linearCall(
    get,
    'query Document($id: String!) { document(id: $id) { title content updatedAt } }',
    { id },
    documentSchema,
    `Linear document ${id}`,
  );
  if (raw.updatedAt === previousRevision) return undefined;
  return {
    ...ref,
    title: raw.title || 'Untitled',
    markdown: raw.content?.trim() ?? '',
    revision: raw.updatedAt,
  };
}

const FETCH: Record<
  LinearLink['kind'],
  (get: Http, ref: ItemRef, id: string, previousRevision?: string) => Promise<Item | undefined>
> = { issue, project, document };

/** A Linear issue, project, or document, as its canonical URL names it (linearLink). Reads only. */
export function linearItem(get: Http, ref: ItemRef, previousRevision?: string) {
  const link = linearLink(new URL(ref.url));
  if (!link) throw new MesaError('usage', `${ref.url} is not a Linear issue, project or document`);
  const id = link.kind === 'issue' ? link.slug : slugId(link.slug);
  return FETCH[link.kind](get, ref, id, previousRevision);
}
