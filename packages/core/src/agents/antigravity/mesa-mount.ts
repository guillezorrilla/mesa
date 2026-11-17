import { unlinkSync } from 'node:fs';
import { MesaError } from '../../lib/result.js';
import { read, write } from '../hooks.js';
import { antigravityCliSettings, antigravityMcpConfig } from './paths.js';

// Antigravity's global mesa-vault and mesa-decisions entries and their allow rules, which Mesa
// wrote before sessions reached the vault through the mesa CLI (ADR-0031) and now only removes:
// `mesa hooks install` takes them out, leaving every other entry, rule, and setting as it was. An
// entry under either name that Mesa did not write, or a file Mesa cannot read, is a conflict it
// reports, leaving both files alone, never an error, so the other agents' hooks carry on.

/** The servers Mesa mounted, by their names and the mesa subcommand each entry ran. */
const SERVERS = [
  { name: 'mesa-vault', subcommand: 'vault mcp' },
  { name: 'mesa-decisions', subcommand: 'decisions mcp' },
];
const ruleOf = (name: string) => `mcp(${name}/*)`;

export type MesaMountStatus = {
  path: string;
  rulePath: string;
  /** An entry or allow rule of Mesa's is still there, for `mesa hooks install` to remove. */
  left: boolean;
  /** Why Mesa leaves both files alone: a foreign entry, or a shape it cannot read. */
  conflict?: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** An entry Mesa wrote: a command and args ending in the server's subcommand, at most `disabled`. */
function owned(entry: unknown, subcommand: string) {
  if (!isObject(entry)) return false;
  const { args } = entry;
  return (
    Object.keys(entry).every((key) => ['command', 'args', 'disabled'].includes(key)) &&
    typeof entry.command === 'string' &&
    Array.isArray(args) &&
    args.every((arg) => typeof arg === 'string') &&
    args.slice(-2).join(' ') === subcommand
  );
}

/** Both files, read and checked: invalid_config for a foreign entry, or a shape Mesa cannot read. */
function readConfig(home: string) {
  const mcpFile = antigravityMcpConfig(home);
  const mcp = read(mcpFile);
  const servers = mcp.settings.mcpServers ?? {};
  if (!isObject(servers))
    throw new MesaError(
      'invalid_config',
      `${mcpFile}: mcpServers is not an object; Mesa left it unchanged`,
    );
  for (const { name, subcommand } of SERVERS)
    if (servers[name] !== undefined && !owned(servers[name], subcommand))
      throw new MesaError(
        'invalid_config',
        `${mcpFile}: ${name} belongs to another server; Mesa left it unchanged`,
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
  const names = SERVERS.map((s) => s.name);
  const mine = (rule: unknown) => names.some((name) => rule === ruleOf(name));
  return {
    mcpFile,
    mcp,
    servers,
    rulesFile,
    rules,
    permissions,
    allow: allow as unknown[],
    left: names.some((name) => servers[name] !== undefined) || allow.some(mine),
    mine,
  };
}

const paths = (home: string) => ({
  path: antigravityMcpConfig(home),
  rulePath: antigravityCliSettings(home),
});

/** Both files, or the conflict that keeps Mesa out of them. */
function load(home: string) {
  try {
    return readConfig(home);
  } catch (error) {
    if (error instanceof MesaError && error.code === 'invalid_config')
      return { conflict: error.message };
    throw error;
  }
}

/** Whether Mesa's old entries or rules are still in Antigravity's global files. */
export function mesaMountStatus(home: string): MesaMountStatus {
  const config = load(home);
  return 'conflict' in config
    ? { ...paths(home), left: false, conflict: config.conflict }
    : { ...paths(home), left: config.left };
}

/**
 * Written, or removed when all it would hold is `empty`, what install once wrote into a file that
 * was not there: a machine with no file before has none after.
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

/** Removes Mesa's entries and rules only; every other server, rule, and setting stays. */
export function removeMesaMounts(home: string): MesaMountStatus & { changed: boolean } {
  const config = load(home);
  if ('conflict' in config || !config.left) return { ...mesaMountStatus(home), changed: false };
  const { mcpFile, mcp, servers, rulesFile, rules, permissions, allow, mine } = config;
  const others = Object.fromEntries(
    Object.entries(servers).filter(([name]) => !SERVERS.some((s) => s.name === name)),
  );
  if (Object.keys(others).length !== Object.keys(servers).length)
    save(mcpFile, mcp, { ...mcp.settings, mcpServers: others }, { mcpServers: {} });
  if (allow.some(mine))
    save(
      rulesFile,
      rules,
      { ...rules.settings, permissions: { ...permissions, allow: allow.filter((r) => !mine(r)) } },
      { permissions: { allow: [] } },
    );
  return { ...mesaMountStatus(home), changed: true };
}
