import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { clickupCall } from '../sources/clickup.js';
import { clickupMillis } from '../sources/clickup-item.js';
import type { ClickupView } from './clickup-view.js';
import type { TicketCategory } from './provider.js';

// The tasks a ClickUp view lists, as ClickUp's API answers them: a List's, a Folder's or a
// Space's (the Workspace's filtered tasks), or a saved view's, subtasks included, read a page of
// 100 at a time up to PAGES pages.

/** How many pages of 100 tasks one read takes at most. */
const PAGES = 3;

const person = z.object({
  id: z.number(),
  username: z.string().nullish(),
  email: z.string().nullish(),
});

/** A task as ClickUp's API answers it, in a list of tasks or alone. */
export const clickupTaskSchema = z.object({
  id: z.string(),
  custom_id: z.string().nullish(),
  name: z.string(),
  team_id: z.string().nullish(),
  /** The task it is a subtask of, by id. */
  parent: z.string().nullish(),
  status: z.object({
    status: z.string(),
    color: z.string().nullish(),
    /** open, custom, done or closed. */
    type: z.string().nullish(),
  }),
  priority: z.object({ priority: z.string(), color: z.string().nullish() }).nullish(),
  assignees: z.array(person).nullish(),
  tags: z.array(z.object({ name: z.string(), tag_bg: z.string().nullish() })).nullish(),
  due_date: clickupMillis,
  markdown_description: z.string().nullish(),
  list: z.object({ name: z.string() }).nullish(),
  folder: z.object({ name: z.string().nullish(), hidden: z.boolean().nullish() }).nullish(),
  space: z.object({ id: z.string() }).nullish(),
});
export type ClickupTask = z.infer<typeof clickupTaskSchema>;
const pageSchema = z.object({
  tasks: z.array(clickupTaskSchema),
  last_page: z.boolean().nullish(),
});

/** A task's key in Mesa: its custom id when its Workspace has them, else its id. */
export const keyOfTask = (task: ClickupTask) => task.custom_id || task.id;

/** A task's assignees, by name and account id. */
export const peopleOf = (task: ClickupTask) =>
  (task.assignees ?? []).map((a) => ({
    name: a.username || a.email || 'Someone',
    accountId: String(a.id),
  }));

/** ClickUp's status types as the shared category: open to do, custom in progress, done and closed done. */
export const categoryOfType = (type: string | null | undefined): TicketCategory =>
  type === 'done' || type === 'closed' ? 'done' : type === 'custom' ? 'indeterminate' : 'new';

/**
 * The request a view sends, its path with its query but the page: a List's tasks, the Workspace's
 * tasks in a Folder or Space, or a saved view's (which takes no narrowing of its own).
 */
function request(view: ClickupView, me: string | undefined) {
  if (view.kind === 'view') return `/v2/view/${view.id}/task?`;
  const query = new URLSearchParams();
  if (view.kind === 'folder') query.set('project_ids[]', view.id);
  if (view.kind === 'space') query.set('space_ids[]', view.id);
  query.set('subtasks', 'true');
  if (view.showDone) query.set('include_closed', 'true');
  if (me !== undefined) query.set('assignees[]', me);
  const path =
    view.kind === 'list' ? `/v2/list/${view.id}/task` : `/v2/team/${view.workspace}/task`;
  return `${path}?${query}&`;
}

/**
 * The tasks `view` lists now, up to PAGES pages, the request it sent, and whether there are more.
 * A saved view narrows by its own filters, so whose and closed are kept here.
 */
export async function readClickupTasks(get: Http, view: ClickupView, me: () => Promise<string>) {
  const who = view.everyone ? undefined : await me();
  const saved = view.kind === 'view';
  const path = request(view, saved ? undefined : who);
  const tasks: ClickupTask[] = [];
  let more = false;
  for (let page = 0; page < PAGES; page++) {
    const body = await clickupCall(
      get,
      `${path}page=${page}`,
      pageSchema,
      `ClickUp ${view.kind} ${view.id}'s tasks`,
    );
    tasks.push(...body.tasks);
    more = !(body.last_page ?? body.tasks.length < 100);
    if (!more) break;
  }
  // `more` says ClickUp had pages after the cap, read before a saved view's narrowing here: the
  // tasks not read may hold more of the person's, so "or more" stays true even when the kept
  // tasks are fewer than the cap, and is said only when the unfiltered cap was hit.
  const kept = saved
    ? tasks.filter(
        (t) =>
          (who === undefined || t.assignees?.some((a) => String(a.id) === who)) &&
          (view.showDone || t.status.type !== 'closed'),
      )
    : tasks;
  return { tasks: kept, query: `GET ${decodeURIComponent(path.slice(0, -1))}`, more };
}
