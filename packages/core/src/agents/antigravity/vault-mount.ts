import { unlinkSync } from 'node:fs';
import { MesaError } from '../../lib/result.js';
import { VAULT_SERVER } from '../../vault/mount/server.js';
import { read, write } from '../hooks.js';
import { VAULT_COMMAND, vaultServer } from '../vault-mount.js';
import { antigravityCliSettings, antigravityMcpConfig } from './paths.js';

// Antigravity's mesa-vault mount (docs/spikes/vault-mcp.md, ADR-0012). agy takes no MCP server
// and no pre-approval per launch, so Mesa owns one named entry in its global MCP config and one
// allow rule in its global settings, next to its hook (hooks.ts), and leaves every other entry,
// rule, and setting as it was. No `env`: agy passes the server the window's environment. Every
// agy on the machine starts the entry; the server lists no tools outside a live Mesa session
// (#300), so the rule grants nothing there. A foreign entry, or a file Mesa cannot read, is a
// conflict it reports and leaves alone, never an error, so the other agents' hooks carry on.

/** Every mesa-vault tool with no prompt; headless agy denies an MCP call it cannot ask about. */
export const ALLOW_RULE = `mcp(${VAULT_SERVER}/*)`;

export type VaultMountStatus = {
  path: string;
  rulePath: string;
  /** Mesa's entry runs this mesa, and its allow rule is there. */
  installed: boolean;
  /** Mesa's entry runs another mesa (one that moved). */
  stale: boolean;
  server: boolean;
  rule: boolean;
  /** The user turned Mesa's entry off in agy; install keeps it off. */
  disabled: boolean;
  /** Why Mesa leaves both files alone: a foreign entry, or a shape it cannot read. */
  conflict?: string;
};

type Entry = { command: string; args: string[]; disabled?: boolean };

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** An entry Mesa wrote: a command and args ending in `vault mcp`, with at most agy's `disabled`. */
function owned(entry: unknown): entry is Entry {
  if (!isObject(entry)) return false;
  const { args } = entry;
  return (
    Object.keys(entry).every((key) => ['command', 'args', 'disabled'].includes(key)) &&
    typeof entry.command === 'string' &&
    Array.isArray(args) &&
    args.every((arg) => typeof arg === 'string') &&
    args.slice(-VAULT_COMMAND.length).join(' ') === VAULT_COMMAND.join(' ') &&
    (entry.disabled === undefined || typeof entry.disabled === 'boolean')
  );
}

/** Both files, read and checked: invalid_config for a foreign entry or a shape Mesa cannot read. */
function readConfig(home: string) {
  const mcpFile = antigravityMcpConfig(home);
  const mcp = read(mcpFile);
  const servers = mcp.settings.mcpServers ?? {};
  if (!isObject(servers))
    throw new MesaError(
      'invalid_config',
      `${mcpFile}: mcpServers is not an object; Mesa left it unchanged`,
    );
  const entry = servers[VAULT_SERVER];
  if (entry !== undefined && !owned(entry))
    throw new MesaError(
      'invalid_config',
      `${mcpFile}: ${VAULT_SERVER} belongs to another server; Mesa left it unchanged`,
    );
  const rulesFile = antigravityCliSettings(home);
  const rules = read(rulesFile);
  const permissions = rules.settings.permissions ?? {};
  const allow = isObject(permissions) ? (permissions.allow ?? []) : undefined;
  if (!isObject(permissions) || !Array.isArray(allow))
    throw new MesaError(
      'invalid_config',
      `${rulesFile}: permissions.allow is not a list; Mesa left it unchanged`,
    );
  return { mcpFile, mcp, servers, entry, rulesFile, rules, permissions, allow: allow as unknown[] };
}

type Config = ReturnType<typeof readConfig> | { conflict: string };

/** Both files, or the conflict that keeps Mesa out of them. */
function load(home: string): Config {
  try {
    return readConfig(home);
  } catch (error) {
    if (error instanceof MesaError && error.code === 'invalid_config')
      return { conflict: error.message };
    throw error;
  }
}

function statusOf(home: string, config: Config, self: readonly string[]): VaultMountStatus {
  const paths = { path: antigravityMcpConfig(home), rulePath: antigravityCliSettings(home) };
  if ('conflict' in config) {
    const none = { installed: false, stale: false, server: false, rule: false, disabled: false };
    return { ...paths, ...none, conflict: config.conflict };
  }
  const { entry, allow } = config;
  const want = vaultServer(self);
  const server =
    entry !== undefined &&
    entry.command === want.command &&
    JSON.stringify(entry.args) === JSON.stringify(want.args);
  const rule = allow.includes(ALLOW_RULE);
  return {
    ...paths,
    installed: server && rule,
    stale: entry !== undefined && !server,
    server,
    rule,
    disabled: entry?.disabled === true,
  };
}

/** Whether Mesa's entry runs this mesa's server, whether it is on, and whether its rule is there. */
export const vaultMountStatus = (home: string, self: readonly string[]) =>
  statusOf(home, load(home), self);

/**
 * Mesa's entry, running this mesa, and its rule; when both are so already, or the files conflict,
 * nothing is written. An entry the user turned off stays off.
 */
export function installVaultMount(home: string, self: readonly string[]) {
  const config = load(home);
  const status = statusOf(home, config, self);
  if ('conflict' in config || status.installed) return { ...status, changed: false };
  const { mcpFile, mcp, servers, entry, rulesFile, rules, permissions, allow } = config;
  const { command, args } = vaultServer(self);
  const off = entry?.disabled === undefined ? {} : { disabled: entry.disabled };
  if (!status.server)
    write(mcpFile, mcp, {
      ...mcp.settings,
      mcpServers: { ...servers, [VAULT_SERVER]: { command, args, ...off } },
    });
  if (!status.rule)
    write(rulesFile, rules, {
      ...rules.settings,
      permissions: { ...permissions, allow: [...allow, ALLOW_RULE] },
    });
  return { ...vaultMountStatus(home, self), changed: true };
}

/**
 * Written, or removed when all it would hold is `empty`, what install writes into a file that was
 * not there: a machine with no file before install has none after uninstall.
 */
function save(
  file: string,
  loaded: Parameters<typeof write>[1],
  settings: Parameters<typeof write>[2],
  empty: object,
) {
  if (JSON.stringify(settings) === JSON.stringify(empty)) unlinkSync(file);
  else write(file, loaded, settings);
}

/** Removes Mesa's entry and its rule only; every other server, rule, and setting stays. */
export function uninstallVaultMount(home: string, self: readonly string[]) {
  const config = load(home);
  if ('conflict' in config) return { ...statusOf(home, config, self), changed: false };
  const { mcpFile, mcp, servers, entry, rulesFile, rules, permissions, allow } = config;
  const ruled = allow.includes(ALLOW_RULE);
  if (entry === undefined && !ruled) return { ...statusOf(home, config, self), changed: false };
  if (entry !== undefined) {
    const { [VAULT_SERVER]: _, ...others } = servers;
    save(mcpFile, mcp, { ...mcp.settings, mcpServers: others }, { mcpServers: {} });
  }
  if (ruled)
    save(
      rulesFile,
      rules,
      {
        ...rules.settings,
        permissions: { ...permissions, allow: allow.filter((rule) => rule !== ALLOW_RULE) },
      },
      { permissions: { allow: [] } },
    );
  return { ...vaultMountStatus(home, self), changed: true };
}
