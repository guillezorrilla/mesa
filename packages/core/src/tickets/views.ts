import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { changeYaml, readYaml } from '../lib/yaml-file.js';
import { findProject } from '../projects/projects.js';
import type { JiraField } from '../sources/jira.js';
import { DEFAULTS, type TicketDefaults } from './defaults.js';
import { parseWith } from './provider.js';
import {
  PROVIDER_IDS,
  type ProviderId,
  providerName,
  type TicketView,
  TicketViewSchema,
} from './providers.js';

// The profile's `tickets.yaml` (CONTEXT.md, Ticket view): the views it defines once, of any
// ticket provider, the projects that follow each, the tracker each project tracks work in, and
// which Saved prompt a ticket session gets. Personal, so never in a project's mesa.yaml.

/** `input` as a view, or a usage error naming what is wrong with it. */
export const parseView = (input: unknown): TicketView => parseWith(TicketViewSchema, input);

const TicketDefaultsSchema = z
  .strictObject({
    /** Write notes before the session starts. */
    notes: z.boolean().optional(),
    /** Assign the ticket to the person when it is someone else's or no one's. */
    assign: z.boolean().optional(),
    /** Start in a new worktree on a branch named after the ticket, or in the main checkout. */
    start: z.enum(['worktree', 'checkout']).optional(),
    /** Files written before the Ticket starts may hold it: read, then dropped. */
    untilDone: z.boolean().optional(),
  })
  .transform(({ untilDone: _, ...set }): Partial<TicketDefaults> => set);
const TicketsSchema = z.strictObject({
  views: z.array(TicketViewSchema).default([]),
  /** Each project's followed view names. */
  follows: z.record(z.string(), z.array(z.string())).default({}),
  /** Each project's tracker, when it set one; unset reads as Jira for a project following Jira views. */
  trackers: z.record(z.string(), z.enum(PROVIDER_IDS)).default({}),
  /** The Saved prompt every ticket session gets, unless its project names its own. */
  prompt: z.string().optional(),
  prompts: z.record(z.string(), z.string()).default({}),
  /** Each project's defaults for a session started from a ticket. */
  defaults: z.record(z.string(), TicketDefaultsSchema).default({}),
  /** The Jira fields every ticket panel shows after its own, in order; each name kept to show it. */
  fields: z
    .array(
      z.strictObject({ id: z.string().min(1), name: z.string() }) satisfies z.ZodType<JiraField>,
    )
    .default([]),
});
export type TicketsFile = z.infer<typeof TicketsSchema>;

const EMPTY: TicketsFile = {
  views: [],
  follows: {},
  trackers: {},
  prompts: {},
  defaults: {},
  fields: [],
};
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The views project `key` follows, in its order, those since removed left out. */
export const followedViews = (tickets: TicketsFile, key: string): TicketView[] =>
  (tickets.follows[key] ?? [])
    .map((name) => tickets.views.find((v) => same(v.name, name)))
    .filter((v): v is TicketView => v !== undefined);

/** The tracker project `key` tracks work in: its own, else Jira when it follows a Jira view. */
export const trackerOf = (tickets: TicketsFile, key: string): ProviderId | undefined =>
  tickets.trackers[key] ??
  (followedViews(tickets, key).some((v) => v.provider === 'jira') ? 'jira' : undefined);

/** The profile's ticket views, follows, and prompts, each change a locked rewrite of the file. */
export function ticketViews(ctx: MesaContext) {
  const file = ctx.paths.tickets;
  const read = (): TicketsFile => {
    ctx.open();
    return existsSync(file) ? readYaml(file, TicketsSchema) : EMPTY;
  };
  const update = <T>(change: (tickets: TicketsFile) => T): T => {
    ctx.open();
    let result: T | undefined;
    changeYaml(
      file,
      TicketsSchema,
      (current = structuredClone(EMPTY)) => {
        result = change(current);
        return current;
      },
      ctx,
      'Mesa ticket views: what each project Tickets tab lists. Managed by mesa tickets.',
    );
    return result as T;
  };
  const view = (tickets: TicketsFile, name: string): TicketView => {
    const found = tickets.views.find((v) => same(v.name, name));
    if (!found) throw new MesaError('not_found', `no ticket view ${name}; see mesa tickets views`);
    return found;
  };
  /** Refuses `name` when a view other than `except` has it. */
  const free = (tickets: TicketsFile, name: string, except?: TicketView) => {
    if (tickets.views.some((v) => v !== except && same(v.name, name)))
      throw new MesaError('usage', `ticket view ${name} already exists`);
  };
  const project = (name: string) => findProject(ctx.open(), name).name;
  return {
    read,
    view: (name: string) => view(read(), name),
    add: (input: unknown) => {
      const added = parseView(input);
      return update((tickets) => {
        free(tickets, added.name);
        tickets.views.push(added);
        return added;
      });
    },
    /** Renames the view, and every project's follow of it. */
    rename: (name: string, to: string) =>
      update((tickets) => {
        const found = view(tickets, name);
        const { name: renamed } = parseView({ ...found, name: to });
        free(tickets, renamed, found);
        for (const [key, names] of Object.entries(tickets.follows))
          tickets.follows[key] = names.map((n) => (same(n, found.name) ? renamed : n));
        found.name = renamed;
        return found;
      }),
    /** Removes the view and every project's follow of it. */
    remove: (name: string) =>
      update((tickets) => {
        const removed = view(tickets, name);
        tickets.views = tickets.views.filter((v) => v !== removed);
        for (const [key, names] of Object.entries(tickets.follows)) {
          const kept = names.filter((n) => !same(n, removed.name));
          if (kept.length) tickets.follows[key] = kept;
          else delete tickets.follows[key];
        }
        return removed;
      }),
    /** Follows view `name` in the project, which must be of the tracker it tracks work in. */
    follow: (projectName: string, name: string) => {
      const key = project(projectName);
      return update((tickets) => {
        const followed = view(tickets, name);
        const tracker = trackerOf(tickets, key);
        if (tracker && followed.provider !== tracker)
          throw new MesaError(
            'usage',
            `${key} tracks work in ${providerName(tracker)}, and ${followed.name} is a ${providerName(followed.provider)} view; see mesa tickets tracker`,
          );
        const names = tickets.follows[key] ?? [];
        if (!names.some((n) => same(n, followed.name))) names.push(followed.name);
        tickets.follows[key] = names;
        return { project: key, following: names };
      });
    },
    unfollow: (projectName: string, name: string) => {
      const key = project(projectName);
      return update((tickets) => {
        const names = (tickets.follows[key] ?? []).filter((n) => !same(n, name));
        if (names.length) tickets.follows[key] = names;
        else delete tickets.follows[key];
        return { project: key, following: names };
      });
    },
    /** The tracker `projectName` tracks work in, if any. */
    tracker: (projectName: string) => trackerOf(read(), project(projectName)),
    /**
     * Sets the tracker `projectName` tracks work in. Every view and follow is kept: the tab lists
     * only the tracker's, so switching back lists the old ones again.
     */
    setTracker: (projectName: string, tracker: ProviderId) => {
      const key = project(projectName);
      return update((tickets) => {
        tickets.trackers[key] = tracker;
        return { project: key, tracker };
      });
    },
    /** `projectName`'s defaults, each one not set taking DEFAULTS'. */
    defaults: (projectName: string): TicketDefaults => ({
      ...DEFAULTS,
      ...read().defaults[project(projectName)],
    }),
    /** Changes some of `projectName`'s defaults, and returns them all. */
    setDefaults: (projectName: string, change: Partial<TicketDefaults>) => {
      const key = project(projectName);
      return update((tickets): TicketDefaults => {
        const next = { ...tickets.defaults[key], ...change };
        tickets.defaults[key] = next;
        return { ...DEFAULTS, ...next };
      });
    },
    /** Sets the fields every ticket panel shows, none to show only its own. */
    setFields: (fields: TicketsFile['fields']) =>
      update((tickets) => {
        tickets.fields = fields;
        return fields;
      }),
    /** Sets, or with no `prompt` clears, the profile's ticket prompt, or `projectName`'s own. */
    setPrompt: (prompt: string | undefined, projectName?: string) => {
      const key = projectName === undefined ? undefined : project(projectName);
      return update((tickets) => {
        if (key === undefined) {
          if (prompt === undefined) delete tickets.prompt;
          else tickets.prompt = prompt;
        } else if (prompt === undefined) delete tickets.prompts[key];
        else tickets.prompts[key] = prompt;
        return { project: key ?? null, prompt: prompt ?? null };
      });
    },
  };
}
