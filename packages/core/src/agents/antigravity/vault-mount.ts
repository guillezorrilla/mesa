import { join } from 'node:path';
import { MesaError } from '../../lib/result.js';
import { read, write } from '../hooks.js';
import { VAULT_COMMAND, VAULT_SERVER, vaultServer } from '../vault-mount.js';

// Antigravity's mesa-vault mount (docs/spikes/vault-mcp.md, ADR-0012). agy takes no MCP server
// and no pre-approval per launch, so Mesa owns one named entry in its global MCP config and one
// allow rule in its global settings, next to its hook (hooks.ts), and leaves every other entry,
// rule, and setting as it was. No `env`: agy passes the server the window's environment. Every
// agy on the machine starts the entry; the server lists no tools outside a live Mesa session
// (#300), so the rule grants nothing there.

const mcpPath = (home: string) => join(home, '.gemini', 'config', 'mcp_config.json');
const rulesPath = (home: string) => join(home, '.gemini', 'antigravity-cli', 'settings.json');

/** Every mesa-vault tool with no prompt; headless agy denies an MCP call it cannot ask about. */
export const ALLOW_RULE = `mcp(${VAULT_SERVER}/*)`;

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

/** Both files, read and checked: a foreign entry or an unreadable shape is refused, never rewritten. */
function config(home: string) {
  const mcpFile = mcpPath(home);
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
  const rulesFile = rulesPath(home);
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

/** Whether Mesa's entry runs this mesa's server, and whether its allow rule is there. */
export function vaultMountStatus(home: string, self: readonly string[]) {
  const { mcpFile, entry, rulesFile, allow } = config(home);
  const want = vaultServer(self);
  const server =
    entry !== undefined &&
    entry.disabled !== true &&
    entry.command === want.command &&
    JSON.stringify(entry.args) === JSON.stringify(want.args);
  const rule = allow.includes(ALLOW_RULE);
  return {
    path: mcpFile,
    rulePath: rulesFile,
    installed: server && rule,
    stale: entry !== undefined && !server,
    server,
    rule,
  };
}

/** Mesa's entry, running this mesa, and its rule; when both are so already, nothing is written. */
export function installVaultMount(home: string, self: readonly string[]) {
  const status = vaultMountStatus(home, self);
  if (status.installed) return { ...status, changed: false };
  const { mcpFile, mcp, servers, rulesFile, rules, permissions, allow } = config(home);
  const { command, args } = vaultServer(self);
  if (!status.server)
    write(mcpFile, mcp, {
      ...mcp.settings,
      mcpServers: { ...servers, [VAULT_SERVER]: { command, args } },
    });
  if (!status.rule)
    write(rulesFile, rules, {
      ...rules.settings,
      permissions: { ...permissions, allow: [...allow, ALLOW_RULE] },
    });
  return { ...vaultMountStatus(home, self), changed: true };
}

/** Removes Mesa's entry and its rule only; every other server, rule, and setting stays. */
export function uninstallVaultMount(home: string, self: readonly string[]) {
  const { mcpFile, mcp, servers, entry, rulesFile, rules, permissions, allow } = config(home);
  const ruled = allow.includes(ALLOW_RULE);
  if (entry === undefined && !ruled) return { ...vaultMountStatus(home, self), changed: false };
  if (entry !== undefined) {
    const { [VAULT_SERVER]: _, ...others } = servers;
    write(mcpFile, mcp, { ...mcp.settings, mcpServers: others });
  }
  if (ruled)
    write(rulesFile, rules, {
      ...rules.settings,
      permissions: { ...permissions, allow: allow.filter((rule) => rule !== ALLOW_RULE) },
    });
  return { ...vaultMountStatus(home, self), changed: true };
}
