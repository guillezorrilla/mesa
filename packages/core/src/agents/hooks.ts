import { existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { shellWord } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { SESSION_ID_VAR } from '../lib/window-vars.js';
import type { Agent } from './names.js';

// The shared JSON hook format Claude Code and Codex read.

type Hook = { type?: string; command?: string; async?: boolean };
type Group = { matcher?: string; hooks?: Hook[] };
type Settings = { hooks?: Record<string, Group[]> } & Record<string, unknown>;

const GUARD = `[ -z "$${SESSION_ID_VAR}" ] || `;
/**
 * The events whose stdout reaches the agent's context: SessionStart's pointer (ADR-0010),
 * UserPromptSubmit's decision advice as `additionalContext` (ADR-0019, #463), and Stop's child
 * reports as a block that continues the turn (#888).
 */
export const SPEAKING_EVENTS: readonly string[] = ['SessionStart', 'UserPromptSubmit', 'Stop'];
/**
 * Stop's command says `--continues`: its stdout reaches the agent, so Mesa may continue the turn.
 * A Stop entry an older mesa wrote drops stdout and lacks it, so nothing is claimed for nothing.
 */
const tail = (agent: Agent, event?: string) =>
  ` hook ${agent}${event === 'Stop' ? ' --continues' : ''} ${event && SPEAKING_EVENTS.includes(event) ? '2>/dev/null' : '>/dev/null 2>&1'} || true`;
/** A hook entry Mesa wrote: exactly its guard and its tail, whatever mesa path sits between. */
const isMesaHook = (h: Hook, agent: Agent) =>
  typeof h.command === 'string' &&
  h.command.startsWith(GUARD) &&
  [tail(agent), tail(agent, 'SessionStart'), tail(agent, 'Stop')].some((end) =>
    h.command?.endsWith(end),
  );

/**
 * The hook's command line. Outside a Mesa session it is a no-op in the shell itself, so the user's
 * other sessions never start node. Only the speaking events pass stdout into provider context;
 * other hook output is dropped. Its status is always 0 (exit 2 would block a tool call).
 */
export const hookCommand = (self: readonly string[], agent: Agent, event?: string) =>
  `${GUARD}${self.map(shellWord).join(' ')}${tail(agent, event)}`;

/** One agent's hook file, containing only the events Mesa owns. */
export type HookFile = {
  path: string;
  agent: Agent;
  /**
   * `async`: Claude Code runs the hook in the background, so the agent never waits on an event
   * whose output Mesa never returns (#894); readers order events by `at` for that.
   */
  events: readonly { event: string; matcher?: string; async?: boolean }[];
};
export type HookFileStatus = {
  path: string;
  installed: boolean;
  /** Mesa's entries are there, but not as this mesa writes them: `mesa hooks install` updates them. */
  stale: boolean;
  events: Record<string, boolean>;
};

type Loaded = { settings: Settings; newline: boolean; indent: string };

export function read(path: string): Loaded {
  if (!existsSync(path)) return { settings: {}, newline: true, indent: '  ' };
  const text = readFileSync(path, 'utf8');
  try {
    const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? '  ';
    const settings: unknown = JSON.parse(text);
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error();
    return { settings: settings as Settings, newline: text.endsWith('\n'), indent };
  } catch {
    throw new MesaError('invalid_config', `${path}: not valid JSON; fix it before Mesa edits it`);
  }
}

/**
 * Written in the file's own indent, through a symlink to its target, keeping its mode.
 * ponytail: JSON.parse drops number forms (1.0) and \u escapes, so only a file JSON.stringify could
 * have written (as Claude writes it) keeps every byte.
 */
export function write(path: string, loaded: Loaded, settings: Settings) {
  mkdirSync(dirname(path), { recursive: true });
  const target = existsSync(path) ? realpathSync(path) : path;
  const mode = existsSync(target) ? statSync(target).mode & 0o777 : 0o600;
  const text = JSON.stringify(settings, null, loaded.indent) + (loaded.newline ? '\n' : '');
  writeFileAtomic(target, text, mode);
}

/** A copy without Mesa's entries: a group or event left empty by that goes, nothing else. */
function withoutMesa(settings: Settings, agent: Agent): Settings {
  if (!settings.hooks) return settings;
  const hooks: Record<string, Group[]> = {};
  for (const [event, groups] of Object.entries(settings.hooks)) {
    const kept = groups.flatMap((g) => {
      const own = g.hooks?.filter((h) => !isMesaHook(h, agent));
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

const mesaHooks = (settings: Settings, event: string, agent: Agent) =>
  (settings.hooks?.[event] ?? []).flatMap((g) =>
    (g.hooks ?? []).filter((h) => isMesaHook(h, agent)),
  );

/** The entry this mesa writes for one event. */
const mesaEntry = (
  self: readonly string[],
  agent: Agent,
  event: string,
  async?: boolean,
): Hook => ({
  type: 'command',
  command: hookCommand(self, agent, event),
  ...(async ? { async: true } : {}),
});
const isCurrent = (h: Hook, want: Hook) => h.command === want.command && h.async === want.async;

export function hooksStatus(file: HookFile, self: readonly string[]): HookFileStatus {
  const { path, agent } = file;
  const { settings } = read(path);
  const events = Object.fromEntries(
    file.events.map(({ event, async }) => [
      event,
      mesaHooks(settings, event, agent).some((h) =>
        isCurrent(h, mesaEntry(self, agent, event, async)),
      ),
    ]),
  );
  const installed = Object.values(events).every(Boolean);
  // Another mesa's command, or this one's from before an event went async (#894).
  const other = file.events.some(({ event, async }) =>
    mesaHooks(settings, event, agent).some(
      (h) => !isCurrent(h, mesaEntry(self, agent, event, async)),
    ),
  );
  // An event Mesa hooks now has no entry where Mesa wrote others (an older mesa's set, #678).
  const missing =
    !installed && file.events.some(({ event }) => mesaHooks(settings, event, agent).length > 0);
  return { path, installed, stale: other || missing, events };
}

/** One Mesa entry per event, running this mesa; when that is already so, nothing is written. */
export function installHooks(
  file: HookFile,
  self: readonly string[],
): HookFileStatus & { changed: boolean } {
  const now = hooksStatus(file, self);
  const once = file.events.every(
    ({ event }) => mesaHooks(read(now.path).settings, event, file.agent).length === 1,
  );
  if (now.installed && !now.stale && once) return { ...now, changed: false };
  const loaded = read(now.path);
  const base = withoutMesa(loaded.settings, file.agent);
  const hooks = { ...base.hooks };
  for (const { event, matcher, async } of file.events) {
    const group: Group = {
      ...(matcher ? { matcher } : {}),
      hooks: [mesaEntry(self, file.agent, event, async)],
    };
    hooks[event] = [...(hooks[event] ?? []), group];
  }
  write(now.path, loaded, { ...base, hooks });
  return { ...hooksStatus(file, self), changed: true };
}

/** Removes Mesa's entries only; the user's hooks are left as they were. */
export function uninstallHooks(
  file: HookFile,
  self: readonly string[],
): HookFileStatus & { changed: boolean } {
  const { path } = file;
  if (!existsSync(path)) return { ...hooksStatus(file, self), changed: false };
  const loaded = read(path);
  const next = withoutMesa(loaded.settings, file.agent);
  const changed = JSON.stringify(next) !== JSON.stringify(loaded.settings);
  if (changed) write(path, loaded, next);
  return { ...hooksStatus(file, self), changed };
}

/**
 * A UserPromptSubmit hook's JSON output that adds `text` to the turn's context, which Claude Code
 * and Codex both read (docs/spikes/decision-assistance-feasibility.md, Native delivery probe).
 */
export const promptContext = (text: string) =>
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text },
  });

/**
 * A Stop hook's JSON output that continues the turn with `reason` as its input, which Claude Code
 * and Codex both read (docs/spikes/codex.md, Stop hook continuation).
 */
export const stopContinuation = (reason: string) => JSON.stringify({ decision: 'block', reason });

/**
 * The event Mesa logs after it continued a turn: the turn goes on, so the session is working
 * (each agent's hookState), not idle as the Stop before it says.
 */
export const STOP_CONTINUED = 'StopContinued';

/**
 * The event a session's setup window logs when its setup fails (sessions/start/setup-window.ts):
 * no agent's state, an Inbox notice naming the window (hookItem).
 */
export const SETUP_FAILED = 'SetupFailed';

/** Whether a Stop payload ends a turn a Stop hook already continued: it must not continue again. */
export const stopHookActive = (payload: unknown) =>
  typeof payload === 'object' &&
  payload !== null &&
  (payload as Record<string, unknown>).stop_hook_active === true;

/** Locations of this mesa's handlers, including user groups and handlers before them. */
export function hookPositions(file: HookFile, self: readonly string[]) {
  const { settings } = read(file.path);
  return Object.fromEntries(
    file.events.map(({ event }) => [
      event,
      (settings.hooks?.[event] ?? []).flatMap((group, g) =>
        (group.hooks ?? []).flatMap((hook, h) =>
          hook.command === hookCommand(self, file.agent, event) ? [`${g}:${h}`] : [],
        ),
      ),
    ]),
  );
}
