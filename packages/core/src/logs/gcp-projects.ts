import type { Runner } from '../lib/process.js';
import { GCLOUD_TIMEOUT_MS, gcloud, jsonList } from './gcloud.js';

// The GCP projects the Cloud Logs setup offers (CONTEXT.md, Cloud Logs), with the organizations
// and folders they sit in, as the Cloud Console groups them.

/** A project the account sees, and its parent: `organizations/<id>` or `folders/<id>`, if any. */
export type CloudProject = { id: string; name: string; parent?: string };
/** An organization or folder, by `organizations/<id>` or `folders/<id>`, with its parent. */
export type CloudProjectGroup = { name: string; parent?: string };

/** How many folders are described at once. */
const FOLDER_READS = 8;
const GROUP = /^(organizations|folders)\/\d+$/;

/** gcloud's `parent`, `{type, id}` (projects) or `folders/<id>` (folders), as a group key. */
function parentKey(parent: unknown): string | undefined {
  if (typeof parent === 'string') return GROUP.test(parent) ? parent : undefined;
  const { type, id } = (parent ?? {}) as { type?: unknown; id?: unknown };
  const key = `${type === 'organization' ? 'organizations' : type === 'folder' ? 'folders' : ''}/${id}`;
  return GROUP.test(key) ? key : undefined;
}

/** `read` over `items`, at most `limit` at once. */
async function pooled<T, R>(items: readonly T[], limit: number, read: (item: T) => Promise<R>) {
  const out: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await read(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/**
 * The organizations and the folders `projects` sit in, their ancestors too, by key; a name gcloud
 * will not give (no role on it) is left out, and the setup shows the group by its id.
 */
async function projectGroups(
  run: Runner,
  projects: CloudProject[],
  orgs: Record<string, unknown>[],
) {
  const groups: Record<string, CloudProjectGroup> = {};
  for (const org of orgs)
    if (typeof org.name === 'string' && GROUP.test(org.name))
      groups[org.name] = { name: String(org.displayName ?? org.name) };
  const tried = new Set<string>();
  let wanted = projects.flatMap((p) => (p.parent?.startsWith('folders/') ? [p.parent] : []));
  while (wanted.length) {
    const batch = [...new Set(wanted)].filter((key) => !tried.has(key));
    for (const key of batch) tried.add(key);
    const read = await pooled(batch, FOLDER_READS, (key) =>
      gcloud(run, 'any project', [
        'resource-manager',
        'folders',
        'describe',
        key.slice('folders/'.length),
        '--format',
        'json(name,displayName,parent)',
      ])
        .then((out) => JSON.parse(out) as Record<string, unknown>)
        .catch(() => undefined),
    );
    wanted = [];
    batch.forEach((key, i) => {
      const folder = read[i];
      if (!folder) return;
      const parent = parentKey(folder.parent);
      groups[key] = { name: String(folder.displayName ?? key), ...(parent ? { parent } : {}) };
      if (parent?.startsWith('folders/')) wanted.push(parent);
    });
  }
  return groups;
}

/**
 * gcloud's default project (`gcloud config get project`) and every project the account sees, by
 * name, from one `gcloud projects list` (an account can see well over a thousand, so the setup
 * loads them once and filters as you type), with the organizations and folders they sit in; with
 * `search`, only the projects whose id or name holds it.
 */
export async function cloudProjects(run: Runner, search?: string) {
  const [current, out, orgs] = await Promise.all([
    run('gcloud', ['config', 'get', 'project'], GCLOUD_TIMEOUT_MS),
    gcloud(run, 'any project', ['projects', 'list', '--format', 'json(projectId,name,parent)']),
    gcloud(run, 'any project', ['organizations', 'list', '--format', 'json(name,displayName)'])
      .then(jsonList)
      .catch(() => []),
  ]);
  const fallback = current.ok ? current.stdout.trim() : '';
  const term = search?.trim().toLowerCase() ?? '';
  const projects: CloudProject[] = jsonList(out)
    .map((row) => {
      const parent = parentKey(row.parent);
      return {
        id: String(row.projectId),
        name: String(row.name ?? row.projectId),
        ...(parent ? { parent } : {}),
      };
    })
    .filter((p) => !term || `${p.id} ${p.name}`.toLowerCase().includes(term))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    current: /^[\w.:-]+$/.test(fallback) ? fallback : null,
    projects,
    groups: await projectGroups(run, projects, orgs),
  };
}
