import { unlinkSync } from 'node:fs';
import { MesaError } from '../../lib/result.js';
import { read, write } from '../hooks.js';
import { DECISIONS_MOUNT, type MesaServer, mesaServer, VAULT_MOUNT } from '../mesa-mount.js';
import { antigravityCliSettings, antigravityMcpConfig } from './paths.js';

// Antigravity's mounts of Mesa's servers (docs/spikes/vault-mcp.md, ADR-0012): mesa-vault, and
// mesa-decisions (#463) the same way. agy takes no MCP server and no pre-approval per launch, so
// Mesa owns one named entry per server in its global MCP config and one allow rule per server in
// its global settings, next to its hook (hooks.ts), and leaves every other entry, rule, and setting
// as it was. No `env`: agy passes the server the window's environment. Every agy on the machine
// starts the entries; each server lists no tools outside a live Mesa session (#300), and
// mesa-decisions none without a Decision model either, so the rules grant nothing there. A foreign
// entry under either name, or a file Mesa cannot read, is a conflict it reports, leaving both files
// alone, never an error, so the other agents' hooks carry on. Every function takes the server,
// mesa-vault by default.

/** Every tool of `server` with no prompt; headless agy denies an MCP call it cannot ask about. */
export const allowRule = (server: MesaServer) => `mcp(${server.name}/*)`;
/** mesa-vault's rule. */
export const ALLOW_RULE = allowRule(VAULT_MOUNT);

export type MesaMountStatus = {
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

/**
 * An entry Mesa wrote: a command and args ending in the server's subcommand (`vault mcp`), with at
 * most agy's `disabled`.
 */
function owned(entry: unknown, server: MesaServer): entry is Entry {
  if (!isObject(entry)) return false;
  const { args } = entry;
  return (
    Object.keys(entry).every((key) => ['command', 'args', 'disabled'].includes(key)) &&
    typeof entry.command === 'string' &&
    Array.isArray(args) &&
    args.every((arg) => typeof arg === 'string') &&
    args.slice(-server.subcommand.length).join(' ') === server.subcommand.join(' ') &&
    (entry.disabled === undefined || typeof entry.disabled === 'boolean')
  );
}

/**
 * Both files, read and checked: invalid_config for a foreign entry under any of Mesa's names, or a
 * shape Mesa cannot read.
 */
function readConfig(home: string, server: MesaServer) {
  const mcpFile = antigravityMcpConfig(home);
  const mcp = read(mcpFile);
  const servers = mcp.settings.mcpServers ?? {};
  if (!isObject(servers))
    throw new MesaError(
      'invalid_config',
      `${mcpFile}: mcpServers is not an object; Mesa left it unchanged`,
    );
  for (const mine of [VAULT_MOUNT, DECISIONS_MOUNT]) {
    const found = servers[mine.name];
    if (found !== undefined && !owned(found, mine))
      throw new MesaError(
        'invalid_config',
        `${mcpFile}: ${mine.name} belongs to another server; Mesa left it unchanged`,
      );
  }
  const entry = servers[server.name] as Entry | undefined;
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
function load(home: string, server: MesaServer): Config {
  try {
    return readConfig(home, server);
  } catch (error) {
    if (error instanceof MesaError && error.code === 'invalid_config')
      return { conflict: error.message };
    throw error;
  }
}

function statusOf(
  home: string,
  config: Config,
  self: readonly string[],
  server: MesaServer,
): MesaMountStatus {
  const paths = { path: antigravityMcpConfig(home), rulePath: antigravityCliSettings(home) };
  if ('conflict' in config) {
    const none = { installed: false, stale: false, server: false, rule: false, disabled: false };
    return { ...paths, ...none, conflict: config.conflict };
  }
  const { entry, allow } = config;
  const want = mesaServer(self, server);
  const ours =
    entry !== undefined &&
    entry.command === want.command &&
    JSON.stringify(entry.args) === JSON.stringify(want.args);
  const rule = allow.includes(allowRule(server));
  return {
    ...paths,
    installed: ours && rule,
    stale: entry !== undefined && !ours,
    server: ours,
    rule,
    disabled: entry?.disabled === true,
  };
}

/** Whether Mesa's entry runs this mesa's server, whether it is on, and whether its rule is there. */
export const mesaMountStatus = (
  home: string,
  self: readonly string[],
  server: MesaServer = VAULT_MOUNT,
) => statusOf(home, load(home, server), self, server);

/**
 * Mesa's entry, running this mesa, and its rule; when both are so already, or the files conflict,
 * nothing is written. An entry the user turned off stays off.
 */
export function installMesaMount(
  home: string,
  self: readonly string[],
  server: MesaServer = VAULT_MOUNT,
) {
  const config = load(home, server);
  const status = statusOf(home, config, self, server);
  if ('conflict' in config || status.installed) return { ...status, changed: false };
  const { mcpFile, mcp, servers, entry, rulesFile, rules, permissions, allow } = config;
  const { command, args } = mesaServer(self, server);
  const off = entry?.disabled === undefined ? {} : { disabled: entry.disabled };
  if (!status.server)
    write(mcpFile, mcp, {
      ...mcp.settings,
      mcpServers: { ...servers, [server.name]: { command, args, ...off } },
    });
  if (!status.rule)
    write(rulesFile, rules, {
      ...rules.settings,
      permissions: { ...permissions, allow: [...allow, allowRule(server)] },
    });
  return { ...mesaMountStatus(home, self, server), changed: true };
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
export function uninstallMesaMount(
  home: string,
  self: readonly string[],
  server: MesaServer = VAULT_MOUNT,
) {
  const config = load(home, server);
  if ('conflict' in config) return { ...statusOf(home, config, self, server), changed: false };
  const { mcpFile, mcp, servers, entry, rulesFile, rules, permissions, allow } = config;
  const rule = allowRule(server);
  const ruled = allow.includes(rule);
  if (entry === undefined && !ruled)
    return { ...statusOf(home, config, self, server), changed: false };
  if (entry !== undefined) {
    const { [server.name]: _, ...others } = servers;
    save(mcpFile, mcp, { ...mcp.settings, mcpServers: others }, { mcpServers: {} });
  }
  if (ruled)
    save(
      rulesFile,
      rules,
      {
        ...rules.settings,
        permissions: { ...permissions, allow: allow.filter((r) => r !== rule) },
      },
      { permissions: { allow: [] } },
    );
  return { ...mesaMountStatus(home, self, server), changed: true };
}
