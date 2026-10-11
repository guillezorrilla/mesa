import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { linearCall, linearPage, PAGE_INFO } from './linear.js';
import { allComments, COMMENTS, commentsSchema } from './linear-item.js';

// The Linear reads a project's Tickets tab needs (CONTEXT.md, Ticket view): teams with their
// current and next cycles and open projects, custom views, the issues a filter or a custom view
// finds, one issue whole, and setting an issue's assignee, Mesa's one write to Linear.

/** How many issues one query asks for. */
const ISSUES_PAGE = 50;
/** How many issues one read lists at most. */
export const LINEAR_TICKETS = 100;
/** How many teams, projects or custom views one read lists. */
// ponytail: one page each; a workspace with more than 100 is rare.
const LIST = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const teamSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  color: z.string().nullish(),
});
export type LinearTeam = { id: string; key: string; name: string; color?: string };
const toTeam = (t: z.infer<typeof teamSchema>): LinearTeam => ({
  id: t.id,
  key: t.key,
  name: t.name,
  ...(t.color ? { color: t.color } : {}),
});

/** The workspace's teams the person is in, by name. */
export async function linearTeams(get: Http): Promise<LinearTeam[]> {
  const { teams } = await linearCall(
    get,
    `query TicketTeams { teams(first: ${LIST}) { nodes { id key name color } } }`,
    {},
    z.object({ teams: z.object({ nodes: z.array(teamSchema) }) }),
    'Linear teams',
  );
  return teams.nodes.map(toTeam).sort((a, b) => a.name.localeCompare(b.name));
}

/** Team `input`, by its id or its key (ENG), or a usage error. */
export async function linearTeam(get: Http, input: string): Promise<LinearTeam> {
  const filter = UUID.test(input) ? { id: { eq: input } } : { key: { eqIgnoreCase: input } };
  const { teams } = await linearCall(
    get,
    'query TicketTeam($filter: TeamFilter) { teams(first: 1, filter: $filter) { nodes { id key name color } } }',
    { filter },
    z.object({ teams: z.object({ nodes: z.array(teamSchema) }) }),
    `Linear team ${input}`,
  );
  const [found] = teams.nodes;
  if (!found) throw new MesaError('usage', `no Linear team ${input}; see mesa tickets teams`);
  return toTeam(found);
}

const cycleSchema = z.object({
  id: z.string(),
  number: z.number(),
  name: z.string().nullish(),
  startsAt: z.string(),
  endsAt: z.string(),
});
/** A team's cycle: its name (Cycle 42 when it has none), and its first and last day. */
export type LinearCycle = { id: string; name: string; startsAt: string; endsAt: string };
const toCycle = (c: z.infer<typeof cycleSchema>): LinearCycle => ({
  id: c.id,
  name: c.name || `Cycle ${c.number}`,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
});
const CYCLE = 'id number name startsAt endsAt';
const CYCLES = `activeCycle { ${CYCLE} } cycles(first: 1, filter: { isNext: { eq: true } }) { nodes { ${CYCLE} } }`;
const cyclesSchema = {
  activeCycle: cycleSchema.nullish(),
  cycles: z.object({ nodes: z.array(cycleSchema) }),
};
const cyclesOf = (team: {
  activeCycle?: z.infer<typeof cycleSchema> | null;
  cycles: { nodes: z.infer<typeof cycleSchema>[] };
}) => {
  const next = team.cycles.nodes[0];
  return {
    ...(team.activeCycle ? { current: toCycle(team.activeCycle) } : {}),
    ...(next ? { next: toCycle(next) } : {}),
  };
};

/** Team `team`'s (by id) current and next cycles, each when it has one. */
export async function linearCycles(get: Http, team: string) {
  const found = await linearCall(
    get,
    `query TicketCycles($team: String!) { team(id: $team) { ${CYCLES} } }`,
    { team },
    z.object({ team: z.object(cyclesSchema) }),
    'Linear cycles',
  );
  return cyclesOf(found.team);
}

/** A project a view can follow: its lead, and how far along it is, from 0 to 1. */
export type LinearProject = { id: string; name: string; lead?: string; progress: number };

/**
 * What a team's Follow dialog picks from: its current and next cycles, and its projects not
 * completed or canceled, most recently updated first.
 */
export async function linearTeamWork(get: Http, team: string) {
  const { team: found } = await linearCall(
    get,
    `query TicketTeamWork($team: String!) { team(id: $team) { ${CYCLES}
      projects(first: ${LIST}, orderBy: updatedAt, filter: { status: { type: { nin: ["completed", "canceled"] } } }) {
        nodes { id name progress lead { name } } } } }`,
    { team },
    z.object({
      team: z.object({
        ...cyclesSchema,
        projects: z.object({
          nodes: z.array(
            z.object({
              id: z.string(),
              name: z.string(),
              progress: z.number(),
              lead: z.object({ name: z.string() }).nullish(),
            }),
          ),
        }),
      }),
    }),
    'Linear team',
  );
  return {
    cycles: cyclesOf(found),
    projects: found.projects.nodes.map(
      (p): LinearProject => ({
        id: p.id,
        name: p.name,
        ...(p.lead ? { lead: p.lead.name } : {}),
        progress: p.progress,
      }),
    ),
  };
}

/** Project `id` (its id or slug id) by name. */
export async function linearProject(get: Http, id: string) {
  const { project } = await linearCall(
    get,
    'query TicketProject($id: String!) { project(id: $id) { id name } }',
    { id },
    z.object({ project: z.object({ id: z.string(), name: z.string() }) }),
    `Linear project ${id}`,
  );
  return project;
}

/** A custom view of issues: whose it is (shared with the workspace, or the person's) and its team. */
export type LinearCustomView = { id: string; name: string; shared: boolean; team?: LinearTeam };
const customViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  shared: z.boolean(),
  modelName: z.string(),
  team: teamSchema.nullish(),
});
const CUSTOM_VIEW = 'id name shared modelName team { id key name color }';
const toCustomView = (v: z.infer<typeof customViewSchema>): LinearCustomView => ({
  id: v.id,
  name: v.name,
  shared: v.shared,
  ...(v.team ? { team: toTeam(v.team) } : {}),
});

/** The custom views of issues the person can open: the workspace's shared ones and their own. */
export async function linearCustomViews(get: Http): Promise<LinearCustomView[]> {
  const { customViews } = await linearCall(
    get,
    `query TicketCustomViews { customViews(first: ${LIST}, filter: { modelName: { eq: "Issue" } }) { nodes { ${CUSTOM_VIEW} } } }`,
    {},
    z.object({ customViews: z.object({ nodes: z.array(customViewSchema) }) }),
    'Linear custom views',
  );
  return customViews.nodes.filter((v) => v.modelName === 'Issue').map(toCustomView);
}

/** Custom view `id` (its id or slug id), which must list issues. */
export async function linearCustomView(get: Http, id: string): Promise<LinearCustomView> {
  const { customView } = await linearCall(
    get,
    `query TicketCustomView($id: String!) { customView(id: $id) { ${CUSTOM_VIEW} } }`,
    { id },
    z.object({ customView: customViewSchema }),
    `Linear custom view ${id}`,
  );
  if (customView.modelName !== 'Issue')
    throw new MesaError('usage', `Linear view ${customView.name} lists no issues`);
  return toCustomView(customView);
}

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
