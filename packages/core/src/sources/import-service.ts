import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import type { SkillRow } from '../skills/sync.js';
import { requireLog } from '../vault/notes.js';
import { type ImportDeps, type ImportResult, importLinks } from './import.js';
import { IMPORT_NOTES, importNotes } from './import-notes.js';
import { snapshotRows } from './snapshots.js';

/** An imported item as `mesa import list` shows it: its latest snapshot, and its note if any. */
export type ImportListRow = ReturnType<typeof snapshotRows>[number] & { note?: string };

/** What a project's imports take beyond the context: the sources, a Skill run, the skills. */
type ImportServiceDeps = Pick<ImportDeps, 'fetch' | 'sites' | 'run'> & {
  skills: (project: string) => SkillRow[];
};

/**
 * A project's Imports (CONTEXT.md, Import): import links, list what it imported, and refresh it.
 * The vault frontmatter is the only record; each import keeps one vault-change receipt listing
 * each item, its snapshot, and its note.
 */
export function importService(ctx: MesaContext, deps: ImportServiceDeps) {
  /**
   * Checked before anything is fetched: a registered project, a laid-out vault, and, with notes
   * on, the import-notes skill enabled for it.
   */
  const prepare = (project: string, notes: boolean) => {
    findProject(ctx.open(), project);
    requireLog(ctx.vaultOf());
    if (notes && !deps.skills(project).find((s) => s.name === IMPORT_NOTES)?.enabled) {
      throw new MesaError(
        'usage',
        `skill ${IMPORT_NOTES} is not enabled for ${project}, so no notes can be written: add it to the profile's skills (mesa config set skills) or to its mesa.yaml skills, or import with --no-notes`,
      );
    }
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
      prepare(project, notes);
      return run(project, links, notes);
    },
    /** The items `project` imported, each with its latest fetch and its note, newest first. */
    list: (project: string) => {
      findProject(ctx.open(), project);
      return { items: list(project) };
    },
    /** Imports `project`'s items again, those of `ids` (an item's id) or all of them. */
    refresh: async (project: string, ids: readonly string[] = [], notes = true) => {
      prepare(project, notes);
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
