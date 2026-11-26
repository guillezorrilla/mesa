// The Cloud Logs setup's project list as rows (CONTEXT.md, Cloud Logs): pinned projects first,
// then "No organization" and each organization, its folders nested as collapsible groups, as the
// Cloud Console groups them. Browser-safe: the app's setup draws these rows.

/** A project and the organization or folder it sits in (gcp-projects.ts). */
type Project = { id: string; name: string; parent?: string };
type Group = { name: string; parent?: string };

/** A row: a group's header, with its project count, or a project, indented by `depth`. */
export type ProjectRow =
  | { kind: 'group'; key: string; name: string; depth: number; count: number; open: boolean }
  | { kind: 'project'; key: string; id: string; name: string; depth: number };

/** Projects under no organization. */
export const NO_ORGANIZATION = 'none';
/** A folder holding more projects than this starts collapsed. */
const FOLDED_PAST = 20;

/** A group's name when gcloud gave none: its kind and id. */
const unnamed = (key: string) =>
  key.startsWith('organizations/')
    ? `Organization ${key.slice('organizations/'.length)}`
    : `Folder ${key.slice('folders/'.length)}`;

/**
 * The rows for `projects` in `groups`: `pinned` first (gcloud's default and the picked ones, as
 * given), then the groups. With `term`, only the projects whose id, name or a group above it holds
 * it, every group with one open; else an organization starts open and a folder of more than 20
 * projects closed, and `toggled` flips a group from how it starts. With `org`, only that one.
 */
export function projectRows(
  projects: readonly Project[],
  groups: Readonly<Record<string, Group>>,
  options: {
    term?: string;
    pinned?: readonly string[];
    toggled?: ReadonlySet<string>;
    /** Only this organization (or NO_ORGANIZATION) and what it holds. */
    org?: string;
  } = {},
): ProjectRow[] {
  const term = options.term?.trim().toLowerCase() ?? '';
  const byId = new Map(projects.map((p) => [p.id, p]));
  // A parent gcloud named no group for is a group of its own, at the top.
  const parentOf = (key: string) => groups[key]?.parent;
  const children = new Map<string, { groups: string[]; projects: Project[] }>();
  const childrenOf = (key: string) => {
    const found = children.get(key) ?? { groups: [], projects: [] };
    children.set(key, found);
    return found;
  };
  const placed = new Set<string>();
  const place = (key: string): void => {
    if (placed.has(key)) return;
    placed.add(key);
    const parent = parentOf(key);
    // A folder whose organization is unknown sits under no organization.
    const above = parent ?? (key.startsWith('folders/') ? NO_ORGANIZATION : '');
    if (above) {
      if (above !== NO_ORGANIZATION) place(above);
      childrenOf(above).groups.push(key);
    } else childrenOf('').groups.push(key);
  };
  for (const project of projects) {
    const key = project.parent ?? NO_ORGANIZATION;
    if (key !== NO_ORGANIZATION) place(key);
    childrenOf(key).projects.push(project);
  }
  if (children.has(NO_ORGANIZATION)) childrenOf('').groups.unshift(NO_ORGANIZATION);
  const nameOf = (key: string) =>
    key === NO_ORGANIZATION ? 'No organization' : (groups[key]?.name ?? unnamed(key));
  const byName = (a: string, b: string) => nameOf(a).localeCompare(nameOf(b));
  const holds = (text: string) => text.toLowerCase().includes(term);
  /** The projects under `key` that show: all, or those matching `term` (`named`: a group above matched). */
  const shown = (key: string, named: boolean): number => {
    const own = childrenOf(key);
    const here = named || (key !== NO_ORGANIZATION && key !== '' && holds(nameOf(key)));
    return (
      own.projects.filter((p) => !term || here || holds(`${p.id} ${p.name}`)).length +
      own.groups.reduce((sum, g) => sum + shown(g, here), 0)
    );
  };
  const rows: ProjectRow[] = [];
  for (const id of options.pinned ?? []) {
    const project = byId.get(id) ?? { id, name: id };
    if (!term || holds(`${project.id} ${project.name}`))
      rows.push({ kind: 'project', key: `pinned:${id}`, id, name: project.name, depth: 0 });
  }
  const walk = (key: string, depth: number, named: boolean) => {
    const count = shown(key, named);
    if (!count) return;
    const here = named || (key !== NO_ORGANIZATION && holds(nameOf(key)));
    const starts = key.startsWith('folders/') ? count <= FOLDED_PAST : true;
    const open = term ? true : options.toggled?.has(key) ? !starts : starts;
    rows.push({ kind: 'group', key, name: nameOf(key), depth, count, open });
    if (!open) return;
    const own = childrenOf(key);
    for (const group of [...own.groups].sort(byName)) walk(group, depth + 1, here);
    for (const p of own.projects)
      if (!term || here || holds(`${p.id} ${p.name}`))
        rows.push({
          kind: 'project',
          key: `${key}:${p.id}`,
          id: p.id,
          name: p.name,
          depth: depth + 1,
        });
  };
  const top = childrenOf('').groups;
  for (const key of [
    ...top.filter((k) => k === NO_ORGANIZATION),
    ...top.filter((k) => k !== NO_ORGANIZATION).sort(byName),
  ])
    if (!options.org || key === options.org) walk(key, 0, false);
  return rows;
}
