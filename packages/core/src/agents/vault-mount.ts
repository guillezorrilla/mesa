import { WINDOW_VARS } from '../sessions/caller.js';
import { VAULT_SERVER } from '../vault/server.js';
import { VAULT_WRITE_TOOLS } from '../vault/tools.js';
import type { Agent } from './names.js';

// How a session's agent mounts mesa-vault, the stdio MCP server `mesa vault mcp` (ADR-0011), with
// every tool pre-approved (docs/spikes/vault-mcp.md, ADR-0012). Claude Code and Codex take it per
// launch, in argv, so every start, resume, fork, and headless run carries it; Antigravity takes
// one global entry instead (antigravity/vault-mount.ts).

/** Whether an agent's launch command carries the mount; Antigravity's is its global entry. */
export const mountsPerLaunch = (agent: Agent | 'terminal') =>
  agent === 'claude' || agent === 'codex';

/** The command an agent starts the server with. */
export type VaultServer = { command: string; args: readonly string[] };

/** The mesa subcommand that is the server. */
export const VAULT_COMMAND = ['vault', 'mcp'] as const;

/**
 * This mesa's `vault mcp`, from the argv that runs it (MesaDeps.self). No --profile: the server
 * reads MESA_PROFILE and MESA_SESSION_ID from the window's environment, which every agent passes
 * on, so Antigravity's one global entry serves every profile.
 */
export function vaultServer(self: readonly string[]): VaultServer {
  const [command = 'mesa', ...args] = self;
  return { command, args: [...args, ...VAULT_COMMAND] };
}

/** Claude Code's permission rule for every tool of the server. */
export const CLAUDE_VAULT_TOOLS = `mcp__${VAULT_SERVER}`;

/** Claude Code's rules for the server's write tools, which a read-only run disallows. */
export const CLAUDE_VAULT_WRITES = VAULT_WRITE_TOOLS.map(
  (tool) => `${CLAUDE_VAULT_TOOLS}__${tool}`,
);

/**
 * Claude Code's --mcp-config, inline, as one argv word. No `env`: Claude passes the server its
 * own environment, the window's, or a background job's launch settings (claude/background.ts).
 * In the `=` form, as the flag is variadic and would take a goal after it as another config.
 */
export const claudeMcpConfig = (server: VaultServer) =>
  `--mcp-config=${JSON.stringify({ mcpServers: { [VAULT_SERVER]: { type: 'stdio', ...server } } })}`;

/**
 * Claude Code's mount for an interactive start, resume, or fork, one argv word each. Never
 * --strict-mcp-config, which would drop the user's own servers.
 */
export const claudeVaultArgs = (server: VaultServer) => [
  claudeMcpConfig(server),
  `--allowedTools=${CLAUDE_VAULT_TOOLS}`,
];

/**
 * Codex's mount: the values of four `-c` overrides, in TOML (JSON strings and string arrays are
 * valid TOML). `env_vars`, as Codex passes a server only a default list of variables otherwise;
 * `approve`, as `codex exec` fails an MCP call under approval_policy=never without it.
 */
export const codexVaultOverrides = (server: VaultServer) =>
  Object.entries({
    command: server.command,
    args: server.args,
    env_vars: WINDOW_VARS,
    default_tools_approval_mode: 'approve',
  }).map(([key, value]) => `mcp_servers.${VAULT_SERVER}.${key}=${JSON.stringify(value)}`);

/** Codex's override that turns off the server's write tools for a read-only run. */
export const CODEX_VAULT_READ_ONLY = `mcp_servers.${VAULT_SERVER}.disabled_tools=${JSON.stringify(VAULT_WRITE_TOOLS)}`;
