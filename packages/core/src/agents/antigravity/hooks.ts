import { existsSync, unlinkSync } from 'node:fs';
import { shellWord } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { SESSION_ID_VAR } from '../../sessions/caller.js';
import { read, write } from '../hooks.js';
import { antigravityHooks } from './paths.js';

const NAME = 'mesa-session-instructions';
const CREATED_FILE = 'Mesa created this hooks file';

/** Antigravity's global hook is inert outside a Mesa window and always returns valid hook JSON. */
export const hookCommand = (self: readonly string[]) =>
  `[ -z "$${SESSION_ID_VAR}" ] && printf '{}' || ${self.map(shellWord).join(' ')} hook antigravity 2>/dev/null || printf '{}'`;

function owned(
  entry: unknown,
): entry is { enabled?: boolean; description?: string; PreInvocation: { command: string }[] } {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  const fields = entry as Record<string, unknown>;
  const handlers = fields.PreInvocation;
  return (
    Object.keys(fields).every((key) => ['PreInvocation', 'enabled', 'description'].includes(key)) &&
    (fields.enabled === undefined || typeof fields.enabled === 'boolean') &&
    (fields.description === undefined || fields.description === CREATED_FILE) &&
    Array.isArray(handlers) &&
    handlers.length === 1 &&
    handlers[0]?.type === 'command' &&
    Object.keys(handlers[0]).every((key) => ['type', 'command'].includes(key)) &&
    typeof handlers[0]?.command === 'string' &&
    handlers[0].command.startsWith(`[ -z "$${SESSION_ID_VAR}" ] && printf '{}' || `) &&
    handlers[0].command.endsWith(" hook antigravity 2>/dev/null || printf '{}'")
  );
}

function config(home: string) {
  const file = antigravityHooks(home);
  const loaded = read(file);
  const entry = loaded.settings[NAME];
  if (entry !== undefined && !owned(entry))
    throw new MesaError(
      'invalid_config',
      `${file}: ${NAME} belongs to another hook; Mesa left it unchanged`,
    );
  return { file, loaded, entry };
}

export function hooksStatus(home: string, self: readonly string[]) {
  const { file, entry } = config(home);
  const installed =
    entry?.enabled !== false && entry?.PreInvocation[0]?.command === hookCommand(self);
  return {
    path: file,
    installed,
    stale: Boolean(entry) && !installed,
    events: { PreInvocation: installed },
  };
}

export function installHooks(home: string, self: readonly string[]) {
  const status = hooksStatus(home, self);
  if (status.installed) return { ...status, changed: false };
  const { file, loaded, entry } = config(home);
  write(file, loaded, {
    ...loaded.settings,
    [NAME]: {
      ...(entry?.description === CREATED_FILE || !existsSync(file)
        ? { description: CREATED_FILE }
        : {}),
      PreInvocation: [{ type: 'command', command: hookCommand(self) }],
    },
  });
  return { ...hooksStatus(home, self), changed: true };
}

export function uninstallHooks(home: string, self: readonly string[]) {
  const { file, loaded, entry } = config(home);
  if (!entry) return { ...hooksStatus(home, self), changed: false };
  const { [NAME]: _, ...settings } = loaded.settings;
  if (entry.description === CREATED_FILE && Object.keys(settings).length === 0) unlinkSync(file);
  else write(file, loaded, settings);
  return { ...hooksStatus(home, self), changed: true };
}
