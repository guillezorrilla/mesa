import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { requireLog } from '../vault/notes.js';
import { type ImportDeps, type ImportResult, importLinks, reachedSites } from './import.js';
import { importNotes } from './import-notes.js';
import { resolveLink } from './links.js';
import { snapshotRows } from './snapshots.js';

/** An imported item as `mesa import list` shows it: its latest snapshot, and its note if any. */
export type ImportListRow = ReturnType<typeof snapshotRows>[number] & { note?: string };

/** What a project's imports take beyond the context: the sources, and a Skill run. */
type ImportServiceDeps = Pick<ImportDeps, 'fetch' | 'sites' | 'run'>;

/**
 * A project's Imports (CONTEXT.md, Import): import links, list what it imported, and refresh it.
 * The vault frontmatter is the only record; each import keeps one vault-change receipt listing
 * each item, its snapshot, and its note.
 */
export function importService(ctx: MesaContext, deps: ImportServiceDeps) {
  /** Checked before anything is fetched: a registered project and a laid-out vault. */
  const prepare = (project: string) => {
    findProject(ctx.open(), project);
    requireLog(ctx.vaultOf());
  };
  const list = (project: string): ImportListRow[] => {
    const vault = ctx.vaultOf();
    const notes = importNotes(vault, project);
    return snapshotRows(vault, project).map((row) => {
      const note = notes.get(row.url);
      return note ? { ...row, note } : row;
    });
  };
  const run = (project: string, links: readonly string[], notes: boolean) =>
    ctx.record(
      {
        kind: 'vault-change',
        summary: (r: ImportResult) =>
          `Imported ${r.items.map((i) => i.id).join(', ')} into ${project}`,
        failure: `Could not import into ${project}`,
        project: () => project,
        inputs: { project, notes },
        outputs: (r) => ({
          items: r.items,
          ...(r.notes ? { notes: r.notes } : {}),
          target: r.items[0]?.note ?? r.items[0]?.snapshot,
        }),
      },
      () =>
        importLinks({ ...deps, notes: ctx.notes(), http: ctx.deps.http }, project, links, notes),
    );
  return {
    /** Imports `links` into `project`'s vault, with notes unless `notes` is false. */
    add: async (project: string, links: readonly string[], notes = true) => {
      if (!links.length) throw new MesaError('usage', 'give one link or more to import');
      prepare(project);
      return run(project, links, notes);
    },
    /** The items `project` imported, each with its latest fetch and its note, newest first. */
    list: (project: string) => {
      findProject(ctx.open(), project);
      return { items: list(project) };
    },
    /**
     * The item `project` imported that `from` names: its id, else a link (or key) that resolves to
     * it. With `importing`, a link to an item not imported yet is imported first, with notes or
     * not, and `notes` says how its Write notes run went; without, it is not_found. A link that
     * cannot be imported is refused with why.
     */
    item: async (
      project: string,
      from: string,
      importing?: { notes: boolean },
    ): Promise<{ item: ImportListRow; notes?: ImportResult['notes'] }> => {
      findProject(ctx.open(), project);
      const byId = list(project).find((item) => item.id === from.trim());
      if (byId) return { item: byId };
      const ref = resolveLink(from, await reachedSites(deps.sites));
      const known = () => list(project).find((i) => i.source === ref.source && i.id === ref.id);
      const found = known();
      if (found) return { item: found };
      if (!importing) {
        throw new MesaError(
          'not_found',
          `${project} imported no ${from}; see mesa import list --project ${project}`,
        );
      }
      prepare(project);
      const { result } = await run(project, [ref.url], importing.notes);
      const imported = known();
      if (!imported) throw new MesaError('internal', `${from} was imported but is not listed`);
      return { item: imported, ...(result.notes ? { notes: result.notes } : {}) };
    },
    /** Imports `project`'s items again, those of `ids` (an item's id) or all of them. */
    refresh: async (project: string, ids: readonly string[] = [], notes = true) => {
      prepare(project);
      const items = list(project);
      const unknown = ids.filter((id) => !items.some((item) => item.id === id));
      if (unknown.length) {
        throw new MesaError(
          'not_found',
          `${project} imported no ${unknown.join(', ')}; see mesa import list --project ${project}`,
        );
      }
      const chosen = ids.length ? items.filter((item) => ids.includes(item.id)) : items;
      if (!chosen.length) throw new MesaError('usage', `${project} has imported nothing yet`);
      return run(
        project,
        chosen.map((item) => item.url),
        notes,
      );
    },
  };
}
