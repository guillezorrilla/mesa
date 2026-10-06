import { existsSync, readFileSync } from 'node:fs';
import type { MesaContext } from '../context.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError } from '../lib/result.js';
import { readRegistry } from '../projects/registry.js';
import { listVault } from '../vault/inventory.js';
import { VAULT } from '../vault/layout.js';
import { requireVaultFolder, vaultFile } from '../vault/scope.js';
import { vaultStatus } from '../vault/vault.js';
import { withVaultLock } from '../vault/vault-lock.js';
import { buildMap } from './map.js';

export type MapSaved = {
  path: string;
  changed: boolean;
  groups: number;
  nodes: number;
  edges: number;
};
/** Regenerate the profile's saved map with no recording, live session scan or provider work. */
export function mapService(ctx: MesaContext) {
  return {
    map: async ({ all = false }: { all?: boolean } = {}): Promise<MapSaved> => {
      const vault = ctx.vaultOf();
      requireVaultFolder(vault);
      if (!vaultStatus(vault).ok)
        throw new MesaError('not_found', `vault ${vault} is not laid out; run mesa vault init`);
      vaultFile(vault, VAULT.map);
      return withVaultLock({ ...ctx, vault }, async () => {
        const file = vaultFile(vault, VAULT.map);
        const now = ctx.clock().getTime();
        const canvas = buildMap(
          ctx.store.list(),
          readRegistry(ctx.paths.registry),
          listVault(vault),
          {
            profile: ctx.profile,
            from: now - 30 * 24 * 60 * 60 * 1000,
            through: now,
            all,
          },
        );
        const text = `${JSON.stringify(canvas, null, 2)}\n`;
        const changed = !existsSync(file) || readFileSync(file, 'utf8') !== text;
        if (changed) writeFileAtomic(file, text);
        return {
          path: VAULT.map,
          changed,
          groups: canvas.nodes.filter((n) => n.type === 'group').length,
          nodes: canvas.nodes.length,
          edges: canvas.edges.length,
        };
      });
    },
  };
}
