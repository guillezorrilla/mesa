import { z } from 'zod';
import { MesaError } from '../lib/result.js';
import { notConnectedError } from '../sources/authorized-fetch.js';
import {
  clickupAccount,
  clickupCall,
  clickupLink,
  clickupUrl,
  type TaskLink,
} from '../sources/clickup.js';
import { clickupComments, clickupIso, customQuery } from '../sources/clickup-item.js';
import { clickupLocations, clickupSavedViews } from '../sources/clickup-locations.js';
import {
  type ClickupTask,
  categoryOfType,
  clickupTaskSchema,
  keyOfTask,
  peopleOf,
  readClickupTasks,
} from './clickup-tasks.js';
import {
  type ClickupView,
  type ClickupViewInput,
  ClickupViewSchema,
  clickupLocationOf,
} from './clickup-view.js';
import { parseWith, type TicketProvider } from './provider.js';
import type { ProviderDeps, ProviderTicket } from './provider.js';
import type { TicketView, ViewInput } from './providers.js';

/** A ClickUp task whole, as its ticket panel shows it. */
export type ClickupDetail = {
  key: string;
  summary: string;
  status: string;
  category: ProviderTicket['category'];
  /** The status's color in ClickUp, hex. */
  color?: string;
  /** The first assignee, as every panel names one. */
  assignee?: { name: string; accountId: string };
  assignees: { name: string; accountId: string }[];
  /** Urgent, High, Normal or Low, and its flag's color. */
  priority?: string;
  priorityColor?: string;
  /** Its tags, with their colors. */
  labels: { name: string; color?: string }[];
  /** Its due date, ISO 8601. */
  due?: string;
  /** Where it is: its Space, Folder (when not hidden) and List. */
  path: string[];
  /** The task it is a subtask of. */
  parent?: { key: string; summary: string };
  description: string;
  comments: { author: string; created: string; markdown: string }[];
  /** None: the fields a profile picks for every panel are Jira's. */
  fields?: undefined;
};

const named = z.object({ name: z.string().nullish() });
const listSchema = z.object({
  name: z.string(),
  folder: named.extend({ hidden: z.boolean().nullish() }).nullish(),
  space: named.nullish(),
});
const folderSchema = z.object({ name: z.string(), space: named.nullish() });
const viewSchema = z.object({ view: z.object({ name: z.string(), type: z.string() }) });

/** A ClickUp key: a task id, or a custom id (with a dash) in its Workspace. */
const KEY = /^[A-Za-z0-9_-]+$/;
const join = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' / ');

/**
 * ClickUp's row of the ticket providers: views over a List, every List in a Folder or Space, or a
 * saved view, subtasks included, narrowed by whose and whether closed; a task read whole; adding
 * the person as an assignee; and the Spaces, Folders, Lists and saved views its Follow dialog
 * picks from. A task's key is its custom id when its Workspace has them, else its id.
 */
export function clickupProvider(deps: ProviderDeps) {
  const get = () => deps.fetch('clickup');
  const workspaces = async () => {
    const sites = await deps.sites('clickup');
    if (!sites?.length) throw notConnectedError('clickup');
    return sites;
  };
  let viewer: ReturnType<typeof clickupAccount> | undefined;
  /** The signed-in account, read once; a failed read is not kept. */
  const me = () => {
    viewer ??= clickupAccount(get()).catch((error: unknown) => {
      viewer = undefined;
      throw error;
    });
    return viewer;
  };

  /** The links `key` may name: its id, or its custom id in `where` or each connected Workspace. */
  const linksOf = async (key: string, where?: string): Promise<TaskLink[]> => {
    if (!key.includes('-')) return [{ kind: 'task', id: key }];
    const ids = where ? [where] : (await workspaces()).map((s) => s.id);
    return ids.map((workspace) => ({ kind: 'task', id: key, workspace }));
  };
  const taskPath = (link: TaskLink, query: string[] = []) => {
    const all = [...query, customQuery(link)].filter(Boolean).join('&');
    return `/v2/task/${link.id}${all ? `?${all}` : ''}`;
  };
  /** Task `key` whole, from the first Workspace that has it. */
  const task = async (key: string, where?: string) => {
    let missing: unknown;
    for (const link of await linksOf(key, where)) {
      try {
        const path = taskPath(link, ['include_markdown_description=true']);
        return {
          link,
          task: await clickupCall(get(), path, clickupTaskSchema, `ClickUp task ${key}`),
        };
      } catch (error) {
        if (!(error instanceof MesaError && error.code === 'not_found')) throw error;
        missing = error;
      }
    }
    throw missing;
  };
  /** A name `read` finds, or none when it cannot: a panel shows without it. */
  const maybe = <T>(read: Promise<T>) => read.catch(() => undefined);

  /** `at`'s name and where it is, read from ClickUp, which checks it too. */
  const located = async ({ kind, id }: Pick<ClickupView, 'kind' | 'id'>) => {
    const what = `ClickUp ${kind} ${id}`;
    if (kind === 'list') {
      const list = await clickupCall(get(), `/v2/list/${id}`, listSchema, what);
      const folder = list.folder?.hidden ? undefined : list.folder?.name;
      return { title: list.name, path: join([list.space?.name, folder]) || undefined };
    }
    if (kind === 'folder') {
      const folder = await clickupCall(get(), `/v2/folder/${id}`, folderSchema, what);
      return { title: folder.name, ...(folder.space?.name ? { path: folder.space.name } : {}) };
    }
    if (kind === 'space') {
      const space = await clickupCall(
        get(),
        `/v2/space/${id}`,
        z.object({ name: z.string() }),
        what,
      );
      return { title: space.name };
    }
    const { view } = await clickupCall(get(), `/v2/view/${id}`, viewSchema, what);
    return { title: view.name, viewType: view.type };
  };

  const row: TicketProvider<ViewInput, TicketView, ClickupDetail> = {
    /** `input` as a view, its location's name and place read when checking it (adding it). */
    view: async (input: ClickupViewInput, check: boolean) => {
      const at = await clickupLocationOf(input, async () => {
        const sites = await workspaces();
        return sites.length === 1 ? sites[0]?.id : undefined;
      });
      return parseWith(ClickupViewSchema, {
        name: input.name,
        provider: 'clickup',
        ...at,
        ...(check ? await located(at) : {}),
        ...(input.everyone ? { everyone: true } : {}),
        ...(input.showDone ? { showDone: true } : {}),
      });
    },
    read: async (view: ClickupView) => {
      const read = await readClickupTasks(get(), view, () => me().then((m) => m.id));
      const tickets = read.tasks.map((t): ProviderTicket => {
        const assignees = peopleOf(t).map((a) => ({ id: a.accountId, name: a.name }));
        const first = assignees[0];
        return {
          key: keyOfTask(t),
          summary: t.name,
          status: t.status.status,
          category: categoryOfType(t.status.type),
          ...(t.status.color ? { color: t.status.color } : {}),
          ...(t.priority ? { priority: priorityName(t) } : {}),
          ...(first ? { assignee: first.name, assigneeId: first.id } : {}),
          assignees,
          ...(t.parent ? { parent: t.parent } : {}),
          url: urlOf(t, view.workspace),
        };
      });
      return { tickets, query: read.query, more: read.more };
    },
    key: (input) => {
      const text = input.trim();
      const link = /^https?:/.test(text) ? clickupLink(new URL(text)) : undefined;
      const key = link?.kind === 'task' ? link.id : text;
      if (!KEY.test(key))
        throw new MesaError('usage', `${input} is not a ClickUp task id or custom id`);
      return key;
    },
    show: async (key, where) => {
      const found = await task(key, where);
      const raw = found.task;
      const [comments, user, space, parent] = await Promise.all([
        clickupComments(get(), found.link, `ClickUp task ${key}`),
        me(),
        raw.space &&
          maybe(
            clickupCall(
              get(),
              `/v2/space/${raw.space.id}`,
              z.object({ name: z.string() }),
              'its Space',
            ),
          ),
        raw.parent &&
          maybe(clickupCall(get(), `/v2/task/${raw.parent}`, clickupTaskSchema, 'its parent task')),
      ]);
      const assignees = peopleOf(raw);
      const folder = raw.folder?.hidden ? undefined : raw.folder?.name;
      const due = clickupIso(raw.due_date);
      return {
        key: keyOfTask(raw),
        summary: raw.name,
        status: raw.status.status,
        category: categoryOfType(raw.status.type),
        ...(raw.status.color ? { color: raw.status.color } : {}),
        ...(assignees[0] ? { assignee: assignees[0] } : {}),
        assignees,
        ...(raw.priority ? { priority: priorityName(raw) } : {}),
        ...(raw.priority?.color ? { priorityColor: raw.priority.color } : {}),
        labels: (raw.tags ?? []).map((t) => ({
          name: t.name,
          ...(t.tag_bg ? { color: t.tag_bg } : {}),
        })),
        ...(due ? { due } : {}),
        path: [space?.name, folder, raw.list?.name].filter((p): p is string => Boolean(p)),
        ...(parent ? { parent: { key: keyOfTask(parent), summary: parent.name } } : {}),
        description: raw.markdown_description ?? '',
        comments: comments.map((c) => ({
          author: c.user?.username ?? 'Someone',
          created: clickupIso(c.date) ?? '',
          markdown: c.comment_text,
        })),
        url: urlOf(raw, found.link.workspace),
        mine: assignees.some((a) => a.accountId === user.id),
      };
    },
    me,
    place: async (where) => {
      const sites = await workspaces();
      return (sites.find((s) => s.id === where) ?? sites[0])?.name ?? 'ClickUp';
    },
    /** Mesa's one write to ClickUp: adds the person beside the task's other assignees. */
    assign: async (key, where) => {
      const links = await linksOf(key, where);
      const link = links.length === 1 && links[0] ? links[0] : (await task(key, where)).link;
      const user = await me();
      const after = await clickupCall(
        get(),
        taskPath(link),
        clickupTaskSchema,
        `Assigning ${key}`,
        {
          assignees: { add: [Number(user.id)], rem: [] },
        },
      );
      if (!peopleOf(after).some((a) => a.accountId === user.id))
        throw new MesaError('usage', `ClickUp did not add you to ${key}`);
      return { assignee: user.name };
    },
  };

  return {
    ...row,
    /** Each connected Workspace's Spaces, Folders and Lists, which a view follows. */
    locations: async () => ({ workspaces: await clickupLocations(get(), await workspaces()) }),
    /** The saved task views at each Workspace's Everything level and in its Spaces. */
    savedViews: async () => ({
      views: await clickupSavedViews(get(), await clickupLocations(get(), await workspaces())),
    }),
  };
}

/** A task's priority as ClickUp names it, capitalized: Urgent, High, Normal or Low. */
const priorityName = (task: ClickupTask) => {
  const name = task.priority?.priority ?? '';
  return `${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`;
};

/** Where a task opens in ClickUp, by the key Mesa names it by (an import takes this link). */
const urlOf = (task: ClickupTask, workspace: string | undefined) => {
  const key = keyOfTask(task);
  const team = task.team_id ?? workspace;
  return clickupUrl(
    key === task.id || !team
      ? { kind: 'task', id: task.id }
      : { kind: 'task', id: key, workspace: team },
  );
};
