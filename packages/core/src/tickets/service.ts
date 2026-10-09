import type { MesaContext } from '../context.js';
import type { Http } from '../lib/http.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import type { SavedPrompt } from '../prompts/prompts.js';
import { notConnectedError } from '../sources/authorized-fetch.js';
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
import { baseJql, viewJql } from './jql.js';
import { describeView, parseView, type TicketView, ticketViews } from './views.js';

export type TicketsDeps = {
  fetch: (source: SourceId) => Http;
  sites: (source: SourceId) => Promise<Site[] | undefined>;
  /** The profile's Saved prompts, which a ticket prompt names. */
  prompts: () => SavedPrompt[];
};

/** What `mesa tickets views add` takes: the view, its site when the connection reaches several. */
export type ViewInput = Omit<TicketView, 'site' | 'boardName' | 'filterName'> & { site?: string };

/** A ticket in a project's Tickets tab: the views that list it and the live sessions from it. */
export type Ticket = JiraTicket & {
  site: string;
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

/** The Tickets tab's views over Jira (CONTEXT.md, Ticket view), and the ticket prompt. */
export function ticketsService(ctx: MesaContext, deps: TicketsDeps) {
  const store = ticketViews(ctx);
  const get = () => deps.fetch('atlassian');
  const connected = async () => {
    const sites = await deps.sites('atlassian');
    if (!sites?.length) throw notConnectedError('atlassian');
    return sites;
  };
  /** The site `name` (its name or cloud id), or the one site the connection reaches. */
  const siteOf = async (name?: string): Promise<Site> => {
    const sites = await connected();
    if (name) {
      const found = sites.find((s) => s.id === name || same(s.name, name));
      if (!found) throw new MesaError('not_found', `Atlassian reaches no site ${name}`);
      return found;
    }
    if (sites.length === 1 && sites[0]) return sites[0];
    throw new MesaError(
      'usage',
      `pass --site: Atlassian reaches ${sites.map((s) => s.name).join(', ')}`,
    );
  };

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
    return {
      jql: viewJql(
        view,
        baseJql(
          view,
          picked.map((s) => s.id),
        ),
      ),
      sprints: picked.map((s) => s.name),
    };
  };

  /** The live sessions started from each Jira key, in any project. */
  const sessionsByKey = () => {
    const by = new Map<string, { id: string; project: string }[]>();
    for (const record of ctx.store.list()) {
      if (record.from?.source !== 'jira' || record.endedAt) continue;
      by.set(record.from.id, [
        ...(by.get(record.from.id) ?? []),
        { id: record.id, project: record.project },
      ]);
    }
    return by;
  };

  const promptName = (project: string) => {
    const file = store.read();
    return file.prompts[project] ?? file.prompt;
  };

  return {
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
     * Adds a view, its shape checked first. A board view's board must have sprints (reading them
     * checks it); its board's and a saved filter's names are kept to show them.
     */
    addView: async (input: ViewInput) => {
      const { site: siteName, ...rest } = input;
      const site = await siteOf(siteName);
      const view = parseView({
        ...rest,
        ...(rest.board !== undefined ? { sprint: rest.sprint ?? 'current' } : {}),
        site: site.id,
      });
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
    removeView: store.remove,
    follow: store.follow,
    unfollow: store.unfollow,
    /** Sets the ticket prompt to Saved prompt `name`, or clears it, for the profile or `project`. */
    setPrompt: (name: string | undefined, project?: string) => {
      const saved =
        name === undefined ? undefined : deps.prompts().find((p) => same(p.name, name))?.name;
      if (name !== undefined && saved === undefined)
        throw new MesaError('not_found', `no saved prompt ${name}; see mesa prompts`);
      return store.setPrompt(saved, project);
    },
    /** The Saved prompt text a ticket session on `project` gets: its own, else the profile's. */
    promptFor: (project: string): string | undefined => {
      const name = promptName(project);
      return name ? deps.prompts().find((p) => same(p.name, name))?.text : undefined;
    },
    boards: async (search?: string, siteName?: string) => {
      const site = await siteOf(siteName);
      return { site: { id: site.id, name: site.name }, boards: await boards(get(), site, search) };
    },
    filters: async (search?: string, siteName?: string) => {
      const site = await siteOf(siteName);
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
      // The prompt a ticket session gets, and the project's own when it names one.
      const base = {
        project: key,
        prompt: promptName(key) ?? null,
        projectPrompt: file.prompts[key] ?? null,
      };
      if (!followed.length) return { ...base, views: [], tickets: [] };
      const sites = await connected();
      const reads = await Promise.allSettled(
        followed.map(async (view) => {
          const site = sites.find((s) => s.id === view.site);
          if (!site) throw new MesaError('not_found', 'its Atlassian site is no longer connected');
          const resolved = await resolve(view, site);
          const found = resolved.jql ? await searchTickets(get(), site, resolved.jql) : [];
          return { site, resolved, found };
        }),
      );
      const live = sessionsByKey();
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
