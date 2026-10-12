import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { linearCall, linearPage, PAGE_INFO } from './linear.js';
import { allComments, COMMENTS, commentsSchema } from './linear-item.js';
import { CYCLE, cycleSchema, toCycle } from './linear-teams.js';

// The Linear issues a project's Tickets tab reads (CONTEXT.md, Ticket view): those a filter or a
// custom view finds, one issue whole, and setting an issue's assignee, Mesa's one write to Linear.

/** How many issues one query asks for. */
const ISSUES_PAGE = 50;
/** How many issues one read lists at most. */
export const LINEAR_TICKETS = 100;

const stateSchema = z.object({ name: z.string(), type: z.string(), color: z.string().nullish() });
const personSchema = z.object({ id: z.string(), name: z.string() }).nullish();
const listedSchema = z.object({
  identifier: z.string(),
  title: z.string(),
  url: z.string(),
  priority: z.number(),
  priorityLabel: z.string(),
  state: stateSchema,
  assignee: personSchema,
});
export type LinearListed = z.infer<typeof listedSchema>;
const LISTED =
  'identifier title url priority priorityLabel state { name type color } assignee { id name }';
const PAGE = `first: $first, after: $after, filter: $filter, orderBy: updatedAt) { nodes { ${LISTED} } ${PAGE_INFO} }`;
const issuesPage = linearPage(listedSchema);

/**
 * The issues `filter` (an IssueFilter) keeps, in custom view `view` when given, most recently
 * updated first: LINEAR_TICKETS at most, a page at a time, and whether there are more.
 */
export async function linearIssues(get: Http, filter: Record<string, unknown>, view?: string) {
  const issues: LinearListed[] = [];
  let after: string | undefined;
  for (;;) {
    const variables = { filter, first: ISSUES_PAGE, after: after ?? null };
    const page = view
      ? (
          await linearCall(
            get,
            `query TicketViewIssues($view: String!, $filter: IssueFilter, $first: Int, $after: String) { customView(id: $view) { issues(${PAGE} } }`,
            { ...variables, view },
            z.object({ customView: z.object({ issues: issuesPage }) }),
            'Linear custom view issues',
          )
        ).customView.issues
      : (
          await linearCall(
            get,
            `query TicketIssues($filter: IssueFilter, $first: Int, $after: String) { issues(${PAGE} }`,
            variables,
            z.object({ issues: issuesPage }),
            'Linear issues',
          )
        ).issues;
    issues.push(...page.nodes);
    const next = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : undefined;
    if (!next || issues.length >= LINEAR_TICKETS)
      return { issues: issues.slice(0, LINEAR_TICKETS), more: Boolean(next) };
    after = next;
  }
}

const issueSchema = z.object({
  issue: listedSchema.extend({
    description: z.string().nullish(),
    estimate: z.number().nullish(),
    labels: z.object({
      nodes: z.array(z.object({ name: z.string(), color: z.string().nullish() })),
    }),
    cycle: cycleSchema.nullish(),
    project: z.object({ name: z.string() }).nullish(),
    team: z.object({ key: z.string(), name: z.string() }),
    comments: commentsSchema,
  }),
});

/** Issue `id` (its identifier, ENG-123) whole, with every comment, oldest first. */
export async function linearIssue(get: Http, id: string) {
  const what = `Linear issue ${id}`;
  const { issue } = await linearCall(
    get,
    `query TicketIssue($id: String!, $after: String) { issue(id: $id) { ${LISTED}
      description estimate labels { nodes { name color } } cycle { ${CYCLE} } project { name }
      team { key name } ${COMMENTS} } }`,
    { id },
    issueSchema,
    what,
  );
  const comments = await allComments(get, id, issue.comments, what);
  return { ...issue, cycle: issue.cycle ? toCycle(issue.cycle) : undefined, comments };
}

/** Sets issue `id`'s assignee to user `assignee`: Mesa's one write to Linear (the write scope). */
export async function assignLinearIssue(get: Http, id: string, assignee: string) {
  const { issueUpdate } = await linearCall(
    get,
    'mutation TicketAssign($id: String!, $assignee: String!) { issueUpdate(id: $id, input: { assigneeId: $assignee }) { success issue { assignee { id name } } } }',
    { id, assignee },
    z.object({
      issueUpdate: z.object({
        success: z.boolean(),
        issue: z.object({ assignee: personSchema }).nullish(),
      }),
    }),
    `Assigning ${id}`,
  );
  if (!issueUpdate.success || issueUpdate.issue?.assignee?.id !== assignee)
    throw new MesaError('internal', `Linear did not assign ${id} to you`);
  return issueUpdate.issue.assignee;
}
