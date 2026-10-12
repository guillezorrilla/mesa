import { z } from 'zod';
import type { Http } from '../lib/http.js';
import { mapLimit } from '../lib/map-limit.js';
import { clickupCall } from './clickup.js';
import type { Site } from './connection.js';

// Where ClickUp tasks live, whole, for a picker that searches it: each Workspace's Spaces, their
// Folders and Lists (the same calls as clickupTree's levels, one per Space for its Folders with
// their Lists, one for its Lists outside any Folder), and the saved views at the Workspace's
// Everything level and in each Space. Requests fan out AT_ONCE at a time, so a Workspace of ten
// Spaces (about 33 requests for both) stays well inside ClickUp's 100 a minute.

/** How many requests a read keeps in flight at once. */
const AT_ONCE = 4;

/** A List, with how many tasks ClickUp counts in it. */
export type ClickupList = { id: string; name: string; tasks?: number };
export type ClickupFolder = { id: string; name: string; lists: ClickupList[] };
export type ClickupSpace = {
  id: string;
  name: string;
  /** Its color in ClickUp, hex. */
  color?: string;
  folders: ClickupFolder[];
  /** Its Lists outside any Folder. */
  lists: ClickupList[];
};
export type ClickupWorkspace = { id: string; name: string; spaces: ClickupSpace[] };

const listSchema = z.object({
  id: z.string(),
  name: z.string(),
  task_count: z.union([z.number(), z.string()]).nullish(),
});
const listOf = (list: z.infer<typeof listSchema>): ClickupList => {
  const tasks = Number(list.task_count);
  return {
    id: list.id,
    name: list.name,
    ...(list.task_count != null && Number.isFinite(tasks) ? { tasks } : {}),
  };
};
const spacesSchema = z.object({
  spaces: z.array(z.object({ id: z.string(), name: z.string(), color: z.string().nullish() })),
});
const foldersSchema = z.object({
  folders: z.array(
    z.object({ id: z.string(), name: z.string(), lists: z.array(listSchema).nullish() }),
  ),
});
const listsSchema = z.object({ lists: z.array(listSchema) });

async function space(
  get: Http,
  s: z.infer<typeof spacesSchema>['spaces'][number],
): Promise<ClickupSpace> {
  const what = `ClickUp space ${s.name}`;
  const { folders } = await clickupCall(
    get,
    `/v2/space/${s.id}/folder?archived=false`,
    foldersSchema,
    `${what}'s folders`,
  );
  const { lists } = await clickupCall(
    get,
    `/v2/space/${s.id}/list?archived=false`,
    listsSchema,
    `${what}'s lists`,
  );
  return {
    id: s.id,
    name: s.name,
    ...(s.color ? { color: s.color } : {}),
    folders: folders.map((f) => ({ id: f.id, name: f.name, lists: (f.lists ?? []).map(listOf) })),
    lists: lists.map(listOf),
  };
}

/** Workspace `site`'s Spaces, archived ones left out. */
const spacesOf = async (get: Http, site: Site) =>
  (
    await clickupCall(
      get,
      `/v2/team/${site.id}/space?archived=false`,
      spacesSchema,
      `ClickUp Workspace ${site.name}'s spaces`,
    )
  ).spaces;

/** Each connected Workspace's Spaces, Folders and Lists, archived ones left out. Reads only. */
export async function clickupLocations(get: Http, sites: Site[]): Promise<ClickupWorkspace[]> {
  return mapLimit(sites, 1, async (site) => ({
    id: site.id,
    name: site.name,
    spaces: await mapLimit(await spacesOf(get, site), AT_ONCE, (s) => space(get, s)),
  }));
}

/** A saved ClickUp view of tasks: its type (List, Board...), and where it is kept. */
export type ClickupSavedView = {
  id: string;
  name: string;
  type: string;
  workspace: string;
  /** Everything, or the Space it is in. */
  where: string;
};

/** The view types that show tasks; Docs, chats, forms and the like do not. */
const TASK_VIEWS = new Set([
  'list',
  'board',
  'calendar',
  'gantt',
  'table',
  'timeline',
  'workload',
  'box',
  'map',
  'mind_map',
  'team',
]);
const viewsSchema = z.object({
  views: z.array(z.object({ id: z.string(), name: z.string(), type: z.string() })),
});

/**
 * The saved task views at each connected Workspace's Everything level and in each of its Spaces
 * (its Spaces list, then one request per place). A view in a Folder or a List is followed by its
 * link.
 */
export async function clickupSavedViews(get: Http, sites: Site[]): Promise<ClickupSavedView[]> {
  const places = (
    await mapLimit(sites, 1, async (site) => [
      { workspace: site.id, path: `/v2/team/${site.id}/view`, where: 'Everything' },
      ...(
        await spacesOf(get, site)
      ).map((s) => ({
        workspace: site.id,
        path: `/v2/space/${s.id}/view`,
        where: s.name,
      })),
    ])
  ).flat();
  const read = await mapLimit(places, AT_ONCE, async (place) => {
    const { views } = await clickupCall(
      get,
      place.path,
      viewsSchema,
      `ClickUp views in ${place.where}`,
    );
    return views
      .filter((v) => TASK_VIEWS.has(v.type))
      .map((v) => ({ ...v, workspace: place.workspace, where: place.where }));
  });
  return read.flat();
}
