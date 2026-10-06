import { projectLabel } from '../../sessions/record/general.js';
import type { VaultBinding } from './binding.js';
import { type Stdio, serveMcp, toolText } from './mcp-server.js';
import { callVaultTool, VAULT_TOOLS, type VaultOwners } from './tools.js';

// The vault server (ADR-0011, CONTEXT.md Vault server): `mesa vault mcp`, the mesa-vault tools
// on stdio for the one session its environment binds it to, and inert outside one.

/** The server's name: the agents' mounts and Antigravity's allow rule name it. */
export const VAULT_SERVER = 'mesa-vault';

/**
 * Serves the mesa-vault tools on `io` until its input ends, saying on stderr first whom it serves.
 * `bind` is asked again on every request: while it finds no live session the server is inert,
 * listing no tools and refusing every call with the reason, so it reads and writes nothing.
 */
export function serveVault(
  io: Stdio,
  version: string,
  bind: () => VaultBinding,
  owners: VaultOwners,
): Promise<void> {
  const bindingOf = (): VaultBinding => {
    try {
      return bind();
    } catch (error) {
      const reason = `session binding failed: ${error instanceof Error ? error.message : String(error)}`;
      io.log(`${VAULT_SERVER}: ${reason}\n`);
      return { refused: reason };
    }
  };
  const binding = bindingOf();
  io.log(
    'session' in binding
      ? `${VAULT_SERVER}: serving session ${binding.session.id} (${projectLabel(binding.session.project)})\n`
      : `${VAULT_SERVER}: listing no tools: ${binding.refused}\n`,
  );
  return serveMcp(
    io,
    { name: VAULT_SERVER, version },
    {
      tools: () => ('session' in bindingOf() ? VAULT_TOOLS : []),
      call: async (name, args) => {
        const now = bindingOf();
        if (!('session' in now)) return toolText(`${VAULT_SERVER} is inert: ${now.refused}`, true);
        return callVaultTool(owners, now.session, name, args);
      },
    },
  );
}
