import { MesaError } from '../lib/result.js';
import type { Account } from '../sources/connection.js';
import { isLinearIdentifier, linearAccount, linearIdOf } from '../sources/linear.js';
import {
  type LinearCycle,
  linearCustomView,
  linearCustomViews,
  linearCycles,
  linearProject,
  linearTeam,
  linearTeams,
  linearTeamWork,
} from '../sources/linear-teams.js';
import {
  assignLinearIssue,
  type LinearListed,
  linearIssue,
  linearIssues,
} from '../sources/linear-tickets.js';
import { type LinearView, type LinearViewInput, LinearViewSchema } from './linear-view.js';
import {
  type ProviderDeps,
  type ProviderTicket,
  parseWith,
  type TicketCategory,
  type TicketProvider,
} from './provider.js';
import type { TicketView, ViewInput } from './providers.js';

/** A Linear issue whole, as its ticket panel shows it. */
export type LinearDetail = {
  key: string;
  summary: string;
  status: string;
  category: TicketCategory;
  assignee?: { name: string; accountId: string };
  /** Linear's priority by name, such as Urgent or No priority. */
  priority: string;
  /** Its level: 0 (none), and 1 (urgent) to 4 (low). */
  priorityLevel: number;
  labels: { name: string; color?: string }[];
  cycle?: LinearCycle;
  estimate?: number;
  project?: string;
  team: string;
  description: string;
  comments: { author: string; created: string; markdown: string }[];
  /** None: the fields a profile picks for every panel are Jira's. */
  fields?: undefined;
};

/**
 * A workflow state type as a shared category: triage, backlog and unstarted to do, started in
 * progress, completed and canceled done.
 */
const categoryOfState = (type: string): TicketCategory =>
  type === 'started'
    ? 'indeterminate'
    : type === 'completed' || type === 'canceled'
      ? 'done'
      : 'new';

const ticketOf = (issue: LinearListed): ProviderTicket => ({
  key: issue.identifier,
  summary: issue.title,
  status: issue.state.name,
  category: categoryOfState(issue.state.type),
  ...(issue.priority ? { priority: issue.priorityLabel } : {}),
  ...(issue.assignee ? { assignee: issue.assignee.name, assigneeId: issue.assignee.id } : {}),
  url: issue.url,
});

/**
 * Linear's row of the ticket providers: views over a team's current or next cycle, a project, or a
 * custom view, narrowed by whose and whether completed or canceled; and the teams, cycles,
 * projects and custom views its Follow dialog picks from.
 */
export function linearProvider(deps: ProviderDeps) {
  const get = () => deps.fetch('linear');
  let viewer: Promise<Account> | undefined;
  /** The signed-in account, read once; a failed read is not kept. */
  const me = () => {
    viewer ??= linearAccount(get()).catch((error: unknown) => {
      viewer = undefined;
      throw error;
    });
    return viewer;
  };

  /** The IssueFilter `view` sends, its cycle found again now, or why it lists nothing. */
  const filterOf = async (view: LinearView) => {
    const filter: Record<string, unknown> = {
      ...(view.project ? { project: { id: { eq: view.project } } } : {}),
      ...(view.everyone ? {} : { assignee: { isMe: { eq: true } } }),
      ...(view.showDone ? {} : { state: { type: { nin: ['completed', 'canceled'] } } }),
    };
    if (view.team === undefined) return { filter };
    const cycles = await linearCycles(get(), view.team);
    const next = view.cycle === 'next';
    const cycle = next ? cycles.next : cycles.current;
    const team = view.teamName ?? view.teamKey ?? view.team;
    if (!cycle) return { note: `No ${next ? 'next' : 'active'} cycle in team ${team}` };
    return { filter: { ...filter, cycle: { id: { eq: cycle.id } } }, sprints: [cycle.name] };
  };

  const row: TicketProvider<ViewInput, TicketView, LinearDetail> = {
    /**
     * `input` with its team, project or custom view found in Linear, and their names kept. Found
     * even when not checking (the live count): a key or a link becomes the id the read sends.
     */
    view: async (input: LinearViewInput) => {
      const { provider: _, team, cycle, project, customView, ...rest } = input;
      // Exactly one of them, before asking Linear for any.
      parseWith(LinearViewSchema, { ...input, provider: 'linear' });
      const found = team ? await linearTeam(get(), team) : undefined;
      const picked = project
        ? await linearProject(get(), linearIdOf(project, 'project'))
        : undefined;
      const saved = customView
        ? await linearCustomView(get(), linearIdOf(customView, 'view'))
        : undefined;
      return parseWith(LinearViewSchema, {
        ...rest,
        provider: 'linear',
        ...(found
          ? { team: found.id, teamKey: found.key, teamName: found.name, cycle: cycle ?? 'current' }
          : {}),
        ...(picked ? { project: picked.id, projectName: picked.name } : {}),
        ...(saved ? { customView: saved.id, customViewName: saved.name } : {}),
      });
    },
    read: async (view: LinearView) => {
      const { filter, note, sprints } = await filterOf(view);
      if (!filter) return { tickets: [], ...(note ? { note } : {}) };
      const { issues, more } = await linearIssues(get(), filter, view.customView);
      const sent = JSON.stringify(filter);
      return {
        tickets: issues.map(ticketOf),
        query: view.customView
          ? `customView(id: "${view.customView}") issues(filter: ${sent})`
          : `issues(filter: ${sent})`,
        ...(sprints ? { sprints } : {}),
        more,
      };
    },
    key: (input) => {
      if (!isLinearIdentifier(input.trim()))
        throw new MesaError('usage', `${input} is not a Linear issue identifier, such as ENG-123`);
      return input.trim().toUpperCase();
    },
    show: async (key) => {
      const [issue, user] = await Promise.all([linearIssue(get(), key), me()]);
      return {
        key: issue.identifier,
        summary: issue.title,
        status: issue.state.name,
        category: categoryOfState(issue.state.type),
        ...(issue.assignee
          ? { assignee: { name: issue.assignee.name, accountId: issue.assignee.id } }
          : {}),
        priority: issue.priorityLabel,
        priorityLevel: issue.priority,
        labels: issue.labels.nodes.map((l) => ({
          name: l.name,
          ...(l.color ? { color: l.color } : {}),
        })),
        ...(issue.cycle ? { cycle: issue.cycle } : {}),
        ...(issue.estimate != null ? { estimate: issue.estimate } : {}),
        ...(issue.project ? { project: issue.project.name } : {}),
        team: issue.team.name,
        description: issue.description ?? '',
        comments: issue.comments.map((c) => ({
          author: c.user?.name ?? 'Someone',
          created: c.createdAt,
          markdown: c.body,
        })),
        url: issue.url,
        mine: issue.assignee?.id === user.id,
      };
    },
    me,
    place: async () => (await deps.sites('linear'))?.[0]?.name ?? 'Linear',
    /** Mesa's one write to Linear: the issue's assignee becomes the person. */
    assign: async (key) => {
      const user = await me();
      const assignee = await assignLinearIssue(get(), key, user.id);
      return { assignee: assignee.name };
    },
  };

  return {
    ...row,
    teams: () => linearTeams(get()),
    /**
     * What team `team` (its key or id) can follow: its current and next cycles, its open
     * projects, and the custom views of issues on it or on no team.
     */
    team: async (team: string) => {
      const found = await linearTeam(get(), team);
      const [work, views] = await Promise.all([
        linearTeamWork(get(), found.id),
        linearCustomViews(get()),
      ]);
      return {
        team: found,
        ...work,
        views: views.filter((v) => !v.team || v.team.id === found.id),
      };
    },
  };
}
