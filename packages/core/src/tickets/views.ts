import { existsSync } from 'node:fs';
import { z } from 'zod';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { changeYaml, readYaml } from '../lib/yaml-file.js';
import { findProject } from '../projects/projects.js';

// The profile's `tickets.yaml` (CONTEXT.md, Ticket view): the Jira views it defines once, the
// projects that follow each, and which Saved prompt a ticket session gets. Personal, so never in a
// project's mesa.yaml.

const ViewSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(60),
    /** The Atlassian site's cloud id. */
    site: z.string().min(1),
    board: z.number().int().positive().optional(),
    /** A board view's board name, kept to show it. */
    boardName: z.string().optional(),
    sprint: z.enum(['current', 'next']).optional(),
    filter: z.string().regex(/^\d+$/).optional(),
    /** A saved filter view's filter name, kept to show it. */
    filterName: z.string().optional(),
    jql: z.string().trim().min(1).max(2000).optional(),
    /** Every assignee's tickets, not only the person's. */
    everyone: z.boolean().optional(),
    /** Done tickets too. */
    showDone: z.boolean().optional(),
  })
  .refine(
    (v) => [v.board, v.filter, v.jql].filter((q) => q !== undefined).length === 1,
    'a view names exactly one of a board, a saved filter, or JQL',
  )
  .refine((v) => v.sprint === undefined || v.board !== undefined, 'only a board view has a sprint');
export type TicketView = z.infer<typeof ViewSchema>;

/** `view` in a line: what it reads and how it narrows it. */
export function describeView(view: TicketView): string {
  const what =
    view.board !== undefined
      ? `${view.sprint === 'next' ? 'Next' : 'Current'} sprint of board ${view.boardName ?? view.board}`
      : view.filter !== undefined
        ? `Saved filter ${view.filterName ?? view.filter}`
        : `JQL: ${view.jql}`;
  const narrowing = [
    view.everyone ? 'everyone' : 'only mine',
    view.showDone ? 'done included' : 'not done',
  ];
  return `${what} (${narrowing.join(', ')})`;
}

/** `input` as a view, or a usage error naming what is wrong with it. */
export function parseView(input: unknown): TicketView {
  const parsed = ViewSchema.safeParse(input);
  if (!parsed.success)
    throw new MesaError('usage', parsed.error.issues[0]?.message ?? 'invalid ticket view');
  return parsed.data;
}

const TicketDefaultsSchema = z.strictObject({
  /** Write notes before the session starts. */
  notes: z.boolean().optional(),
  /** Assign the ticket to the person when it is someone else's or no one's. */
  assign: z.boolean().optional(),
  /** Start in a new worktree on a branch named after the ticket, or in the main checkout. */
  start: z.enum(['worktree', 'checkout']).optional(),
});
export type TicketDefaults = Required<z.infer<typeof TicketDefaultsSchema>>;
/** What a project gets until it changes them: notes, assigning, and a worktree, all on. */
export const DEFAULTS: TicketDefaults = { notes: true, assign: true, start: 'worktree' };

const TicketsSchema = z.strictObject({
  views: z.array(ViewSchema).default([]),
  /** Each project's followed view names. */
  follows: z.record(z.string(), z.array(z.string())).default({}),
  /** The Saved prompt every ticket session gets, unless its project names its own. */
  prompt: z.string().optional(),
  prompts: z.record(z.string(), z.string()).default({}),
  /** Each project's defaults for a session started from a ticket. */
  defaults: z.record(z.string(), TicketDefaultsSchema).default({}),
});
export type TicketsFile = z.infer<typeof TicketsSchema>;

const EMPTY: TicketsFile = { views: [], follows: {}, prompts: {}, defaults: {} };
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

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
  const project = (name: string) => findProject(ctx.open(), name).name;
  return {
    read,
    view: (name: string) => view(read(), name),
    add: (input: unknown) => {
      const added = parseView(input);
      return update((tickets) => {
        if (tickets.views.some((v) => same(v.name, added.name)))
          throw new MesaError('usage', `ticket view ${added.name} already exists`);
        tickets.views.push(added);
        return added;
      });
    },
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
    follow: (projectName: string, name: string) => {
      const key = project(projectName);
      return update((tickets) => {
        const followed = view(tickets, name);
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
    /** `projectName`'s defaults, each one not set taking DEFAULTS'. */
    defaults: (projectName: string): TicketDefaults => ({
      ...DEFAULTS,
      ...read().defaults[projectName],
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
