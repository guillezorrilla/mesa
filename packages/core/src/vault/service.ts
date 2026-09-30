import type { MesaContext } from '../context.js';
import { findProject } from '../projects/projects.js';
import { callerOf } from '../sessions/caller.js';
import { GENERAL_PROJECT } from '../sessions/general.js';
import { listVault, type VaultInventory } from './inventory.js';
import type { VaultFilter } from './item.js';
import { logLine } from './notes.js';
import { openInObsidian } from './obsidian.js';
import { projectContext } from './project-context.js';
import { readVaultItem } from './reader.js';
import { searchVault, type VaultSearchFilter } from './search.js';
import { sessionGoals } from './session-goals.js';
import { sessionWrites } from './session-writes.js';
import { initVault, vaultStatus } from './vault.js';

/**
 * The profile's vault: laying it out, its status, its inventory, reading an item, searching it,
 * a project's context and earlier goals, opening it, the session writes, and `mesa log`.
 */
export function vaultService(ctx: MesaContext) {
  const { record, vaultOf, deps, store } = ctx;
  /** A registered project, or General; not_found otherwise. */
  const known = (project: string) => {
    if (project !== GENERAL_PROJECT) findProject(ctx.open(), project);
    return project;
  };
  /** The session this mesa runs in, if any: its own goal is not an earlier one. */
  const caller = () => callerOf({ store, env: deps.env, profileName: ctx.profile }).session?.id;
  return {
    vault: {
      init: (force = false) =>
        record(
          {
            summary: (r) => `Laid out the vault: ${r.created.join(', ')}`,
            failure: 'Could not lay out the vault',
            inputs: { force },
            outputs: (r) => ({ created: r.created }),
            changed: (r) => r.created.length > 0,
          },
          () => initVault({ path: vaultOf(), force, clock: deps.clock }),
        ),
      status: () => vaultStatus(vaultOf()),
      /** Every item in the vault (listVault), with the vault and how many are listed. */
      list: (filter?: VaultFilter): VaultInventory => {
        const vault = vaultOf();
        const items = listVault(vault, filter);
        return { vault, total: items.length, items };
      },
      /** One item as the reader shows it (readVaultItem). */
      read: (path: string) => readVaultItem(vaultOf(), path),
      /** The items with every word of `text` in them (searchVault). */
      search: (text: string, filter?: VaultSearchFilter) => searchVault(vaultOf(), text, filter),
      /** A project's overview (projectContext); `exclude` defaults to the calling session. */
      context: (project: string, { exclude = caller() }: { exclude?: string } = {}) =>
        projectContext({ vault: vaultOf(), store }, known(project), { exclude }),
      /** A project's earlier session goals (sessionGoals); `exclude` defaults to the caller. */
      goals: (
        project: string,
        { limit, exclude = caller() }: { limit?: number; exclude?: string } = {},
      ) => sessionGoals({ vault: vaultOf(), store }, known(project), { limit, exclude }),
      /** Opens the vault, or one item in it, in Obsidian: the URI by default, the CLI with `cli`. */
      open: (note?: string, cli = false) =>
        openInObsidian({ run: deps.run, obsidian: deps.obsidian }, { vault: vaultOf(), note, cli }),
      ...sessionWrites(ctx),
    },
    log: (text: string) => logLine(ctx.notes(), text),
  };
}
