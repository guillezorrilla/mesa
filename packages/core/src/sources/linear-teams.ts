import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { linearCall } from './linear.js';

// What a Linear ticket view can follow (CONTEXT.md, Ticket view): the workspace's teams, a team's
// current and next cycles and its open projects, and the custom views of issues.

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

export const cycleSchema = z.object({
  id: z.string(),
  number: z.number(),
  name: z.string().nullish(),
  startsAt: z.string(),
  endsAt: z.string(),
});
/** A team's cycle: its name (Cycle 42 when it has none), and its first and last day. */
export type LinearCycle = { id: string; name: string; startsAt: string; endsAt: string };
export const toCycle = (c: z.infer<typeof cycleSchema>): LinearCycle => ({
  id: c.id,
  name: c.name || `Cycle ${c.number}`,
  startsAt: c.startsAt,
  endsAt: c.endsAt,
});
export const CYCLE = 'id number name startsAt endsAt';
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

/** Custom view `id` (its id or slug id), which must list issues; not_found when it is no view. */
export async function linearCustomView(get: Http, id: string): Promise<LinearCustomView> {
  const { customView } = await linearCall(
    get,
    `query TicketCustomView($id: String!) { customView(id: $id) { ${CUSTOM_VIEW} } }`,
    { id },
    z.object({ customView: customViewSchema }),
    `Linear custom view ${id}`,
  ).catch((error: unknown) => {
    // A view's link or id is the person's to check, not the connection's.
    if (error instanceof MesaError && error.code === 'not_found')
      throw new MesaError('not_found', `no Linear custom view ${id}`);
    throw error;
  });
  if (customView.modelName !== 'Issue')
    throw new MesaError('usage', `Linear view ${customView.name} lists no issues`);
  return toCustomView(customView);
}
