import type { MesaContext } from '../context.js';
import { listVault, type VaultInventory } from './inventory.js';
import type { VaultFilter } from './item.js';
import { logLine } from './notes.js';
import { openInObsidian } from './obsidian.js';
import { readVaultItem } from './reader.js';
import { initVault, vaultStatus } from './vault.js';

/**
 * The profile's vault: laying it out, its status, its inventory, reading an item, opening it, and
 * `mesa log`.
 */
export function vaultService(ctx: MesaContext) {
  const { record, vaultOf, deps } = ctx;
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
      /** Opens the vault, or one item in it, in Obsidian: the URI by default, the CLI with `cli`. */
      open: (note?: string, cli = false) =>
        openInObsidian({ run: deps.run, obsidian: deps.obsidian }, { vault: vaultOf(), note, cli }),
    },
    log: (text: string) => logLine(ctx.notes(), text),
  };
}
