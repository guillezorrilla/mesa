import type { MesaContext } from '../context.js';
import { findProject } from '../projects/projects.js';
import { BASES_MEANINGFUL_FILTER } from '../receipts/policy.js';
import { GENERAL_PROJECT } from '../sessions/record/general.js';
import { callerOf } from '../sessions/window/caller.js';
import { writeBases } from './bases.js';
import { captureByHand } from './capture/by-hand.js';
import { vaultHealth } from './health.js';
import { listVault, type VaultInventory } from './inventory.js';
import type { VaultFilter } from './item.js';
import { vaultBinding } from './mount/binding.js';
import type { Stdio } from './mount/mcp-server.js';
import { projectContext } from './mount/project-context.js';
import { serveVault } from './mount/server.js';
import { sessionGoals } from './mount/session-goals.js';
import { sessionWrites } from './mount/session-writes.js';
import { VAULT_TOOLS } from './mount/tools.js';
import { openInObsidian } from './obsidian.js';
import { readVaultItem } from './reader.js';
import { searchVault, type VaultSearchFilter } from './search.js';
import { initVault, vaultStatus } from './vault.js';

/**
 * The profile's vault: laying it out, its status, its inventory, reading an item, searching it,
 * a project's context and earlier goals, opening it, session writes, a session's capture, and
 * the vault server. `run` is a Skill run, waited for (the sessions service's).
 */
export function vaultService(
  ctx: MesaContext,
  deps: { run: Parameters<typeof captureByHand>[0]['run'] },
) {
  const { record, vaultOf, store } = ctx;
  /** A registered project, or General; not_found otherwise. */
  const known = (project: string) => {
    if (project !== GENERAL_PROJECT) findProject(ctx.open(), project);
    return project;
  };
  /** The session this mesa runs in, if any: its own goal is not an earlier one. */
  const caller = () => callerOf({ store, env: ctx.env, profileName: ctx.profile }).session?.id;
  /** One item as the reader shows it (readVaultItem). */
  const read = (path: string) => readVaultItem(vaultOf(), path);
  /** The items with every word of `text` in them (searchVault). */
  const search = (text: string, filter?: VaultSearchFilter) => searchVault(vaultOf(), text, filter);
  /** A project's overview (projectContext); `exclude` defaults to the calling session. */
  const context = (project: string, { exclude = caller() }: { exclude?: string } = {}) =>
    projectContext({ vault: vaultOf(), store }, known(project), { exclude });
  /** A project's earlier session goals (sessionGoals); `exclude` defaults to the caller. */
  const goals = (
    project: string,
    { limit, exclude = caller() }: { limit?: number; exclude?: string } = {},
  ) => sessionGoals({ vault: vaultOf(), store }, known(project), { limit, exclude });
  const writes = sessionWrites(ctx);
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
          () => initVault({ path: vaultOf(), force, clock: ctx.clock }),
        ),
      status: () => vaultStatus(vaultOf()),
      health: () => vaultHealth(vaultOf()),
      bases: () => writeBases({ ...ctx, vault: vaultOf() }, BASES_MEANINGFUL_FILTER),
      /** Every item in the vault (listVault), with the vault and how many are listed. */
      list: (filter?: VaultFilter): VaultInventory => {
        const vault = vaultOf();
        const items = listVault(vault, filter);
        return { vault, total: items.length, items };
      },
      read,
      search,
      context,
      goals,
      /** Opens the vault, or one item in it, in Obsidian: the URI by default, the CLI with `cli`. */
      open: (note?: string, cli = false) =>
        openInObsidian({ run: ctx.run, obsidian: ctx.obsidian }, { vault: vaultOf(), note, cli }),
      ...writes,
      /** Captures session `id` now (captureByHand, `mesa vault capture`). */
      capture: (id: string) => captureByHand({ ...ctx, run: deps.run }, id),
      /** The mesa-vault tools a bound server lists (ADR-0011). */
      tools: () => VAULT_TOOLS,
      /** Serves the mesa-vault tools on `io` until its input ends, to this process's session. */
      mcp: (io: Stdio, version: string) =>
        serveVault(io, version, () => vaultBinding(ctx), {
          read,
          search,
          context,
          goals,
          ...writes,
        }),
    },
  };
}
