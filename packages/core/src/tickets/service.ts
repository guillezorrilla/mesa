import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import type { SavedPrompt } from '../prompts/prompts.js';
import type { Site } from '../sources/connection.js';
import {
  boards,
  filter,
  filters,
  findBoard,
  type JiraTicket,
  searchTickets,
  sprints,
} from '../sources/jira-tickets.js';
import type { SourceId } from '../sources/sources.js';
import { type JiraDeps, jiraAccess } from './jira-access.js';
import { baseJql, viewJql } from './jql.js';
import { liveSessions } from './live.js';
import { ticketActions } from './ticket.js';
import { describeView, parseView, type TicketView, ticketViews } from './views.js';

export type TicketsDeps = JiraDeps & {
  /** The profile's Saved prompts, which a ticket prompt names. */
  prompts: () => SavedPrompt[];
};

/** What `mesa tickets views add` takes: the view, its site when the connection reaches several. */
export type ViewInput = Omit<TicketView, 'site' | 'siteName' | 'boardName' | 'filterName'> & {
  site?: string;
};

/** A ticket in a project's Tickets tab: the views that list it and the live sessions from it. */
export type Ticket = JiraTicket & {
  site: string;
  /** Assigned to the signed-in person. */
  mine: boolean;
  views: string[];
  sessions: { id: string; project: string }[];
};

/** A followed view as the tab shows it: what it reads now, or why it lists nothing. */
export type FollowedView = {
  name: string;
  describe: string;
  /** A board view's sprints this read. */
  sprints?: string[];
  /** Why it lists nothing that is not an error: a board with no active sprint. */
  note?: string;
  error?: string;
  /** Reconnecting this source fixes the error. */
  connect?: SourceId;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The Tickets tab's views over Jira (CONTEXT.md, Ticket view), its tickets, and their prompt. */
export function ticketsService(ctx: MesaContext, deps: TicketsDeps) {
  const store = ticketViews(ctx);
  const jira = jiraAccess(deps);
  const { get } = jira;

  /** The JQL `view` reads now: a board view's current or next sprint is found again each time. */
  const resolve = async (view: TicketView, site: Site) => {
    if (view.board === undefined) return { jql: viewJql(view, baseJql(view)) };
    const next = view.sprint === 'next';
    const found = await sprints(get(), site, view.board, next ? 'future' : 'active');
    const picked = next ? found.slice(0, 1) : found;
    if (!picked.length) {
      const which = next ? 'next' : 'active';
      return { note: `No ${which} sprint on board ${view.boardName ?? view.board}` };
    }
    const ids = picked.map((s) => s.id);
    return { jql: viewJql(view, baseJql(view, ids)), sprints: picked.map((s) => s.name) };
  };

  /** `input` as a view on its site, its shape checked first; `name` is the view's name. */
  const viewOf = async (input: ViewInput) => {
    const { site: siteName, ...rest } = input;
    const site = await jira.siteOf(siteName);
    const sprint = rest.board !== undefined ? { sprint: rest.sprint ?? 'current' } : {};
    return { site, view: parseView({ ...rest, ...sprint, site: site.id, siteName: site.name }) };
  };

  const savedPrompt = (name: string) => {
    const saved = deps.prompts().find((p) => same(p.name, name));
    if (!saved) throw new MesaError('not_found', `no saved prompt ${name}; see mesa prompts`);
    return saved;
  };
  const promptName = (project: string) => {
    const file = store.read();
    return file.prompts[project] ?? file.prompt;
  };

  return {
    ...ticketActions(ctx, jira),
    /** Every view the profile defines, and the projects following each. */
    views: () => {
      const file = store.read();
      return file.views.map((view) => ({
        ...view,
        describe: describeView(view),
        following: Object.entries(file.follows)
          .filter(([, names]) => names.some((n) => same(n, view.name)))
          .map(([project]) => project),
      }));
    },
    /**
     * Adds a view. A board view's board must have sprints (reading them checks it); its board's
     * and a saved filter's names are kept to show them.
     */
    addView: async (input: ViewInput) => {
      const { site, view } = await viewOf(input);
      if (view.board !== undefined) {
        await sprints(get(), site, view.board, 'active');
        const found = await findBoard(get(), site, view.board);
        if (found) view.boardName = found.name;
      }
      if (view.filter !== undefined)
        view.filterName = (await filter(get(), site, view.filter)).name;
      const added = store.add(view);
      return { ...added, describe: describeView(added) };
    },
    /** How many tickets `input` lists now, without saving it: the Follow dialog's live count. */
    preview: async (input: Omit<ViewInput, 'name'>) => {
      const { site, view } = await viewOf({ ...input, name: 'preview' });
      const resolved = await resolve(view, site);
      const found = resolved.jql ? await searchTickets(get(), site, resolved.jql) : [];
      return {
        describe: describeView(view),
        jql: resolved.jql ?? null,
        count: found.length,
        // ponytail: one page of TICKETS (100); "100 or more" is enough for a count.
        more: found.length >= 100,
        ...(resolved.sprints ? { sprints: resolved.sprints } : {}),
        ...(resolved.note ? { note: resolved.note } : {}),
      };
    },
    removeView: store.remove,
    follow: store.follow,
    unfollow: store.unfollow,
    defaults: store.defaults,
    setDefaults: store.setDefaults,
    /** Sets the ticket prompt to Saved prompt `name`, or clears it, for the profile or `project`. */
    setPrompt: (name: string | undefined, project?: string) =>
      store.setPrompt(name === undefined ? undefined : savedPrompt(name).name, project),
    /**
     * The Saved prompt text a ticket session on `project` gets: `override` when given (null for
     * none), else the project's own, else the profile's.
     */
    promptFor: (project: string, override?: string | null): string | undefined => {
      if (override === null) return undefined;
      if (override !== undefined) return savedPrompt(override).text;
      const name = promptName(project);
      return name ? deps.prompts().find((p) => same(p.name, name))?.text : undefined;
    },
    boards: async (search?: string, siteName?: string) => {
      const site = await jira.siteOf(siteName);
      return { site: { id: site.id, name: site.name }, boards: await boards(get(), site, search) };
    },
    filters: async (search?: string, siteName?: string) => {
      const site = await jira.siteOf(siteName);
      return {
        site: { id: site.id, name: site.name },
        filters: await filters(get(), site, search),
      };
    },
    /**
     * `project`'s tickets: every followed view read now, a ticket in two of them listed once.
     * A view that fails says why and the rest still list.
     */
    list: async (project: string) => {
      const key = findProject(ctx.open(), project).name;
      const file = store.read();
      const followed = (file.follows[key] ?? [])
        .map((name) => file.views.find((v) => same(v.name, name)))
        .filter((v): v is TicketView => v !== undefined);
      // The prompt a ticket session gets, the project's own when it names one, and its defaults.
      const base = {
        project: key,
        prompt: promptName(key) ?? null,
        projectPrompt: file.prompts[key] ?? null,
        defaults: store.defaults(key),
      };
      if (!followed.length) return { ...base, views: [], tickets: [] };
      const sites = await jira.connected();
      const [myId, reads] = await Promise.all([
        // Without the account, no ticket reads as the person's; the list still shows.
        jira.me().then(
          (me) => me.id,
          () => undefined,
        ),
        Promise.allSettled(
          followed.map(async (view) => {
            const site = sites.find((s) => s.id === view.site);
            if (!site)
              throw new MesaError(
                'invalid_config',
                `Atlassian is signed in to another site: reconnect to ${view.siteName ?? view.site} to read this view`,
                { connect: 'atlassian' },
              );
            const resolved = await resolve(view, site);
            const found = resolved.jql ? await searchTickets(get(), site, resolved.jql) : [];
            return { site, resolved, found };
          }),
        ),
      ]);
      const live = liveSessions(ctx);
      const tickets = new Map<string, Ticket>();
      const views = followed.map((view, at): FollowedView => {
        const shown: FollowedView = { name: view.name, describe: describeView(view) };
        const read = reads[at];
        if (read?.status !== 'fulfilled') {
          const error: unknown = read?.reason;
          shown.error = error instanceof Error ? error.message : String(error);
          const details = error instanceof MesaError ? error.details : undefined;
          const connect = (details as { connect?: SourceId } | undefined)?.connect;
          return connect ? { ...shown, connect } : shown;
        }
        const { site, resolved, found } = read.value;
        for (const ticket of found) {
          const id = `${site.id}:${ticket.key}`;
          const listed = tickets.get(id);
          if (listed) listed.views.push(view.name);
          else
            tickets.set(id, {
              ...ticket,
              site: site.id,
              mine: myId !== undefined && ticket.assigneeId === myId,
              views: [view.name],
              sessions: live.get(ticket.key) ?? [],
            });
        }
        return {
          ...shown,
          ...(resolved.sprints ? { sprints: resolved.sprints } : {}),
          ...(resolved.note ? { note: resolved.note } : {}),
        };
      });
      return { ...base, views, tickets: [...tickets.values()] };
    },
  };
}
