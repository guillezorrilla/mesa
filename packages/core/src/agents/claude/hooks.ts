import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileAtomic } from '../../lib/atomic-file.js';
import { shellWord } from '../../lib/process.js';
import { MesaError } from '../../lib/result.js';
import { claudeSettings } from './paths.js';

// Mesa's entries in Claude Code's user settings (ADR-0003 and its amendments): each event runs
// `mesa hook claude`, which appends the payload to the session's event log. Codex joins in #43.

/** The events Mesa listens to; PreToolUse only for AskUserQuestion. */
export const HOOK_EVENTS: readonly { event: string; matcher?: string }[] = [
  { event: 'SessionStart' },
  { event: 'UserPromptSubmit' },
  { event: 'PermissionRequest' },
  { event: 'PreToolUse', matcher: 'AskUserQuestion' },
  // The only hook between an approval or an answer and Stop (ADR-0003 amendment).
  { event: 'PostToolUse' },
  { event: 'Notification' },
  { event: 'Stop' },
  { event: 'SessionEnd' },
];

type Hook = { type?: string; command?: string };
type Group = { matcher?: string; hooks?: Hook[] };
type Settings = { hooks?: Record<string, Group[]> } & Record<string, unknown>;

const GUARD = '[ -z "$MESA_SESSION_ID" ] || ';
const TAIL = ' hook claude >/dev/null 2>&1 || true';
/** A hook entry Mesa wrote: exactly its guard and its tail, whatever mesa path sits between. */
const isMesaHook = (h: Hook) =>
  typeof h.command === 'string' && h.command.startsWith(GUARD) && h.command.endsWith(TAIL);

/**
 * The hook's command line. Outside a Mesa session it is a no-op in the shell itself, so the user's
 * other Claude sessions never start node. Its output is dropped (SessionStart and
 * UserPromptSubmit add stdout to Claude's context) and its status is always 0 (exit 2 would block
 * a tool call).
 */
// ponytail: synchronous, about 0.1 s of node per event inside Mesa sessions only; add "async": true
// if that shows, and order events by their `at` then.
export const hookCommand = (self: readonly string[]) =>
  `${GUARD}${self.map(shellWord).join(' ')}${TAIL}`;

/** Mesa's Claude Code hooks in ~/.claude/settings.json. */
export type ClaudeHooksStatus = {
  path: string;
  /** Every event has Mesa's entry, running this mesa. */
  installed: boolean;
  /** Some entry runs a mesa that is no longer this one (moved or rebuilt elsewhere): reinstall. */
  stale: boolean;
  events: Record<string, boolean>;
};

/** Both kinds of Mesa hook: Claude Code's, and the pane-died hook on the profile's tmux server. */
export type HooksStatus = ClaudeHooksStatus & { tmux: TmuxHookStatus };

/** The profile's tmux socket, whether a server runs there, and whether it has this mesa's hook. */
export type TmuxHookStatus = { socket: string; server: boolean; paneDied: boolean };

type Loaded = { settings: Settings; newline: boolean; indent: string };

function read(path: string): Loaded {
  if (!existsSync(path)) return { settings: {}, newline: true, indent: '  ' };
  const text = readFileSync(path, 'utf8');
  try {
    const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? '  ';
    return { settings: JSON.parse(text) as Settings, newline: text.endsWith('\n'), indent };
  } catch {
    throw new MesaError('invalid_config', `${path}: not valid JSON; fix it before Mesa edits it`);
  }
}

/**
 * Written in the file's own indent, through a symlink to its target, keeping its mode.
 * ponytail: JSON.parse drops number forms (1.0) and \u escapes, so only a file JSON.stringify could
 * have written (as Claude writes it) keeps every byte.
 */
function write(path: string, loaded: Loaded, settings: Settings) {
  mkdirSync(dirname(path), { recursive: true });
  const target = existsSync(path) ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
  const text = JSON.stringify(settings, null, loaded.indent) + (loaded.newline ? '\n' : '');
  writeFileAtomic(target, text, mode);
}

/** A copy without Mesa's entries: a group or event left empty by that goes, nothing else. */
function withoutMesa(settings: Settings): Settings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, Group[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups.flatMap((g) => {
      const own = g.hooks?.filter((h) => !isMesaHook(h));
      if (!g.hooks || own?.length === g.hooks.length) return [g];
      return own?.length ? [{ ...g, hooks: own }] : [];
    });
    if (kept.length || !groups.length) hooks[event] = kept;
  }
  const emptied = Object.keys(hooks).length === 0 && Object.keys(settings.hooks).length > 0;
  const { hooks: _, ...rest } = settings;
  if (emptied) return rest;
  // The same key order: `hooks` stays where it was.
  return Object.fromEntries(
    Object.entries(settings).map(([k, v]) => [k, k === 'hooks' ? hooks : v]),
  );
}

const mesaHooks = (settings: Settings, event: string) =>
  (settings.hooks?.[event] ?? []).flatMap((g) => (g.hooks ?? []).filter(isMesaHook));

export function hooksStatus(home: string, self: readonly string[]): ClaudeHooksStatus {
  const path = claudeSettings(home);
  const { settings } = read(path);
  const command = hookCommand(self);
  const events = Object.fromEntries(
    HOOK_EVENTS.map(({ event }) => [
      event,
      mesaHooks(settings, event).some((h) => h.command === command),
    ]),
  );
  const stale = HOOK_EVENTS.some(({ event }) =>
    mesaHooks(settings, event).some((h) => h.command !== command),
  );
  return { path, installed: Object.values(events).every(Boolean), stale, events };
}

/** One Mesa entry per event, running this mesa; when that is already so, nothing is written. */
export function installHooks(
  home: string,
  self: readonly string[],
): ClaudeHooksStatus & { changed: boolean } {
  const now = hooksStatus(home, self);
  const once = HOOK_EVENTS.every(
    ({ event }) => mesaHooks(read(now.path).settings, event).length === 1,
  );
  if (now.installed && !now.stale && once) return { ...now, changed: false };
  const loaded = read(now.path);
  const base = withoutMesa(loaded.settings);
  const hooks = { ...base.hooks };
  for (const { event, matcher } of HOOK_EVENTS) {
    const group: Group = {
      ...(matcher ? { matcher } : {}),
      hooks: [{ type: 'command', command: hookCommand(self) }],
    };
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  write(now.path, loaded, { ...base, hooks });
  return { ...hooksStatus(home, self), changed: true };
}

/** Removes Mesa's entries only; the user's hooks are left as they were. */
export function uninstallHooks(
  home: string,
  self: readonly string[],
): ClaudeHooksStatus & { changed: boolean } {
  const path = claudeSettings(home);
  if (!existsSync(path)) return { ...hooksStatus(home, self), changed: false };
  const loaded = read(path);
  const next = withoutMesa(loaded.settings);
  const changed = JSON.stringify(next) !== JSON.stringify(loaded.settings);
  if (changed) write(path, loaded, next);
  return { ...hooksStatus(home, self), changed };
}
