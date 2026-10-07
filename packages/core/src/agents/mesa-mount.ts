import { DECISIONS_SERVER } from '../decisions/server.js';
import { WINDOW_VARS } from '../lib/window-vars.js';
import { VAULT_SERVER } from '../vault/mount/server.js';
import { VAULT_WRITE_TOOLS } from '../vault/mount/tools.js';
import type { Agent } from './names.js';

// How a session's agent mounts Mesa's stdio MCP servers, each with every tool pre-approved
// (docs/spikes/vault-mcp.md, ADR-0012): mesa-vault, `mesa vault mcp` (ADR-0011), always, and beside
// it, while the profile has a Decision model, mesa-decisions, `mesa decisions mcp` (ADR-0019,
// #463). Claude Code and Codex take them per launch, in argv, so every start, resume, fork, and
// headless run carries them; Antigravity takes one global entry each instead
// (antigravity/mesa-mount.ts).

/** Whether an agent's launch command carries the mounts; Antigravity's are its global entries. */
export const mountsPerLaunch = (agent: Agent | 'terminal') =>
  agent === 'claude' || agent === 'codex';

/** One of Mesa's servers as an agent's config names it: its name and the mesa subcommand it is. */
export type MesaServer = { name: string; subcommand: readonly string[] };
export const VAULT_MOUNT: MesaServer = { name: VAULT_SERVER, subcommand: ['vault', 'mcp'] };
export const DECISIONS_MOUNT: MesaServer = {
  name: DECISIONS_SERVER,
  subcommand: ['decisions', 'mcp'],
};

/** The command an agent starts a server with. */
export type ServerCommand = { command: string; args: readonly string[] };

/**
 * This mesa running `server`, from the argv that runs it (MesaDeps.self). No --profile: the server
 * reads MESA_PROFILE and MESA_SESSION_ID from the window's environment, which every agent passes
 * on, so Antigravity's one global entry serves every profile.
 */
export function mesaServer(self: readonly string[], server: MesaServer): ServerCommand {
  const [program = 'mesa', ...args] = self;
  return { command: program, args: [...args, ...server.subcommand] };
}

/** What a launch mounts: mesa-vault always, and mesa-decisions while there is a Decision model. */
export type Mounts = { vault: ServerCommand; decisions?: ServerCommand };

/**
 * This mesa's mounts for a launch. With no Decision model (`decisions` off) nothing of
 * mesa-decisions is mounted, so no tool is listed and the agent works as before.
 */
export const launchMounts = (
  self: readonly string[],
  { decisions }: { decisions: boolean },
): Mounts => ({
  vault: mesaServer(self, VAULT_MOUNT),
  ...(decisions ? { decisions: mesaServer(self, DECISIONS_MOUNT) } : {}),
});

/** The servers of `mounts` by their config names, mesa-vault first. */
const servers = (mounts: Mounts) =>
  Object.entries({ [VAULT_SERVER]: mounts.vault, [DECISIONS_SERVER]: mounts.decisions }).filter(
    (entry): entry is [string, ServerCommand] => entry[1] !== undefined,
  );

/** Claude Code's permission rule for every tool of the server. */
export const CLAUDE_VAULT_TOOLS = `mcp__${VAULT_SERVER}`;
/** Claude Code's permission rule for the decisions server's tool. */
export const CLAUDE_DECISIONS_TOOLS = `mcp__${DECISIONS_SERVER}`;

/** Claude Code's rules for every tool `mounts` mounts. */
export const claudeMountTools = (mounts: Mounts) => [
  CLAUDE_VAULT_TOOLS,
  ...(mounts.decisions ? [CLAUDE_DECISIONS_TOOLS] : []),
];

/** Claude Code's rules for the server's write tools, which a read-only run disallows. */
export const CLAUDE_VAULT_WRITES = VAULT_WRITE_TOOLS.map(
  (tool) => `${CLAUDE_VAULT_TOOLS}__${tool}`,
);

/**
 * Claude Code's --mcp-config, inline, as one argv word. No `env`: Claude passes the server its
 * own environment, the window's, or a background job's launch settings (claude/background.ts).
 * In the `=` form, as the flag is variadic and would take a goal after it as another config.
 */
export const claudeMcpConfig = (mounts: Mounts) =>
  `--mcp-config=${JSON.stringify({
    mcpServers: Object.fromEntries(
      servers(mounts).map(([name, server]) => [name, { type: 'stdio', ...server }]),
    ),
  })}`;

/**
 * Claude Code's mount for an interactive start, resume, or fork, one argv word each. Never
 * --strict-mcp-config, which would drop the user's own servers.
 */
export const claudeMountArgs = (mounts: Mounts) => [
  claudeMcpConfig(mounts),
  `--allowedTools=${claudeMountTools(mounts).join(',')}`,
];

/**
 * Codex's mount: the values of four `-c` overrides, in TOML (JSON strings and string arrays are
 * valid TOML). `env_vars`, as Codex passes a server only a default list of variables otherwise;
 * `approve`, as `codex exec` fails an MCP call under approval_policy=never without it.
 */
export const codexMountOverrides = (mounts: Mounts) =>
  servers(mounts).flatMap(([name, server]) =>
    Object.entries({
      command: server.command,
      args: server.args,
      env_vars: WINDOW_VARS,
      default_tools_approval_mode: 'approve',
    }).map(([key, value]) => `mcp_servers.${name}.${key}=${JSON.stringify(value)}`),
  );

/** Codex's override that turns off the server's write tools for a read-only run. */
export const CODEX_VAULT_READ_ONLY = `mcp_servers.${VAULT_SERVER}.disabled_tools=${JSON.stringify(VAULT_WRITE_TOOLS)}`;
