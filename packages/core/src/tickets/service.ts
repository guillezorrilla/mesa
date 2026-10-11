import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import type { SavedPrompt } from '../prompts/prompts.js';
import { notConnectedError } from '../sources/authorized-fetch.js';
import { itemIdOfKey } from '../sources/items.js';
import type { SourceId } from '../sources/sources.js';
import { liveSessions } from './live.js';
import { originRepo } from './project-repo.js';
import type { ProviderDeps, ProviderTicket } from './provider.js';
import {
  connectProviders,
  describeView,
  PROVIDERS,
  type ProviderId,
  providerOf,
  ticketId,
  type ViewInput,
  type ViewQuery,
} from './providers.js';
import { ticketActions } from './ticket.js';
import { followedViews, ticketViews, trackerOf } from './views.js';

export type TicketsDeps = Omit<ProviderDeps, 'fields' | 'origin'> & {
  /** The profile's Saved prompts, which a ticket prompt names. */
  prompts: () => SavedPrompt[];
};

export type { ViewInput } from './providers.js';

/** A ticket in a project's Tickets tab: the views that list it and the live sessions from it. */
export type Ticket = ProviderTicket & {
  /** Its id across providers, such as jira:LC-12. */
  id: string;
  provider: ProviderId;
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

/**
 * The Tickets tab (CONTEXT.md, Ticket view): views over each project's tracker, read through
 * its row of the ticket providers, their tickets, and the prompt a ticket session gets.
 */
export function ticketsService(ctx: MesaContext, deps: TicketsDeps) {
  const store = ticketViews(ctx);
  /** The fields every ticket panel shows after its own. */
  const shown = () => store.read().fields;
  const rows = connectProviders({
    ...deps,
    fields: shown,
    origin: (project) => originRepo(ctx, project),
  });
  const { jira, github } = rows;

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
    ...ticketActions(ctx, rows),
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
    /** Adds a view, checked against its provider first. */
    addView: async (input: ViewInput) => {
      const view = await rows[input.provider ?? 'jira'].view(input, true);
      const added = store.add(view);
      return { ...added, describe: describeView(added) };
    },
    /** How many tickets `input` lists now, without saving it: the Follow dialog's live count. */
    preview: async (input: ViewQuery) => {
      const row = rows[input.provider ?? 'jira'];
      const view = await row.view({ ...input, name: 'preview' }, false);
      const read = await row.read(view);
      return {
        describe: describeView(view),
        // ponytail: Jira's word for the query sent (GitHub's request too), shown under Advanced.
        jql: read.query ?? null,
        count: read.tickets.length,
        more: read.more ?? false,
        ...(read.sprints ? { sprints: read.sprints } : {}),
        ...(read.note ? { note: read.note } : {}),
      };
    },
    renameView: (name: string, to: string) => {
      const renamed = store.rename(name, to);
      return { ...renamed, describe: describeView(renamed) };
    },
    removeView: store.remove,
    follow: store.follow,
    unfollow: store.unfollow,
    /** The tracker a project tracks work in, null when it has none yet. */
    tracker: (project: string) => {
      const key = findProject(ctx.open(), project).name;
      return { project: key, tracker: store.tracker(key) ?? null };
    },
    /** Sets the tracker a project tracks work in; its other views stay, unlisted. */
    setTracker: (project: string, tracker: string) =>
      store.setTracker(project, providerOf(tracker)),
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
    boards: jira.boards,
    filters: jira.filters,
    repos: github.repos,
    repo: github.repo,
    /** The site's Jira fields a ticket panel can show, whose name holds `search`, and the ones it shows. */
    fields: async (search?: string, siteName?: string) => ({
      ...(await jira.fields(search, siteName)),
      shown: shown(),
    }),
    /**
     * Sets the Jira fields every ticket panel shows, by id in order (none for only its own);
     * each must be one of the site's, and its name is kept to show it.
     */
    setFields: async (ids: readonly string[], siteName?: string) => {
      // Only a field not shown yet needs the site's list: hiding one asks Jira nothing.
      let known = shown();
      if (ids.some((id) => !known.some((f) => f.id === id)))
        known = (await jira.fields(undefined, siteName)).fields;
      return store.setFields(
        [...new Set(ids)].map((id) => {
          const found = known.find((f) => f.id === id);
          if (!found) throw new MesaError('usage', `no Jira field ${id}; see mesa tickets fields`);
          return found;
        }),
      );
    },
    /**
     * `project`'s tickets: every followed view of its tracker read now, a ticket in two of them
     * listed once. A view that fails says why and the rest still list.
     */
    list: async (project: string) => {
      const key = findProject(ctx.open(), project).name;
      const file = store.read();
      const tracker = trackerOf(file, key);
      const followed = followedViews(file, key).filter((v) => v.provider === tracker);
      // The prompt a ticket session gets, the project's own when it names one, and its defaults.
      const base = {
        project: key,
        tracker: tracker ?? null,
        prompt: promptName(key) ?? null,
        projectPrompt: file.prompts[key] ?? null,
        defaults: store.defaults(key),
      };
      if (!tracker || !followed.length) return { ...base, views: [], tickets: [] };
      const { source } = PROVIDERS[tracker];
      // Not connected: the views still list, each saying to connect, and `connect` names the
      // source, so the tab offers one Connect for all of them.
      if (!(await deps.sites(source))?.length) {
        const error = notConnectedError(source).message;
        const views = followed.map(
          (view): FollowedView => ({
            name: view.name,
            describe: describeView(view),
            error,
            connect: source,
          }),
        );
        return { ...base, connect: source, views, tickets: [] };
      }
      const row = rows[tracker];
      const [myId, reads] = await Promise.all([
        // Without the account, no ticket reads as the person's; the list still shows.
        row.me().then(
          (me) => me.id,
          () => undefined,
        ),
        Promise.allSettled(followed.map((view) => row.read(view))),
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
        for (const ticket of read.value.tickets) {
          const id = ticketId(tracker, ticket.key);
          // The same key on two Atlassian sites is two tickets.
          const where = `${ticket.site ?? ''}:${id}`;
          const listed = tickets.get(where);
          if (listed) listed.views.push(view.name);
          else
            tickets.set(where, {
              ...ticket,
              id,
              provider: tracker,
              mine:
                myId !== undefined &&
                (ticket.assigneeId === myId ||
                  Boolean(ticket.assignees?.some((a) => a.id === myId))),
              views: [view.name],
              sessions: live.get(ticketId(tracker, itemIdOfKey(ticket.key))) ?? [],
            });
        }
        const { sprints, note } = read.value;
        return { ...shown, ...(sprints ? { sprints } : {}), ...(note ? { note } : {}) };
      });
      return { ...base, views, tickets: [...tickets.values()] };
    },
  };
}
