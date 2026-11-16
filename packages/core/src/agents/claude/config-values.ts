import { join } from 'node:path';
import { z } from 'zod';
import { readJson } from '../../lib/json-file.js';
import type { Env } from '../../lib/process.js';
import { CLAUDE_PROJECT_DIR, claudeSettings } from './paths.js';

// The values `/config` sets, read from where Claude Code keeps them (#1218): its global config
// (`~/.claude.json`, or `.claude.json` in CLAUDE_CONFIG_DIR) and its settings (user, then the
// project's shared and local files, the last one set winning). Where a key is kept, and its value
// when nothing is set, is what claude 2.1.325's own /config panel reads; any other key is looked
// up under its own name, so a key added later still shows a value once one is saved.

/** A `/config` key's place: the field path in the global config or the settings, and its default. */
type Place = { field: string; fallback?: string };

/** The keys /config names differently from where it keeps them, or that have a default. */
const PLACES: Record<string, Place> = {
  agentPushNotifEnabled: { field: 'agentPushNotifEnabled', fallback: 'false' },
  autoCompact: { field: 'autoCompactEnabled', fallback: 'true' },
  autoConnectIde: { field: 'autoConnectIde', fallback: 'false' },
  autoScroll: { field: 'autoScrollEnabled' },
  checkpoints: { field: 'fileCheckpointingEnabled' },
  copyOnSelect: { field: 'copyOnSelect', fallback: 'true' },
  defaultToAgentsView: { field: 'defaultToAgentsView', fallback: 'false' },
  editor: { field: 'editorMode', fallback: 'normal' },
  externalEditorContext: { field: 'externalEditorContext', fallback: 'false' },
  gitignore: { field: 'respectGitignore' },
  inputNeededNotifEnabled: { field: 'inputNeededNotifEnabled', fallback: 'false' },
  notifChannel: { field: 'preferredNotifChannel' },
  outputStyle: { field: 'outputStyle', fallback: 'default' },
  permissionMode: { field: 'permissions.defaultMode', fallback: 'default' },
  prStatus: { field: 'prStatusFooterEnabled', fallback: 'true' },
  progressBar: { field: 'terminalProgressBarEnabled' },
  promptSuggestionEnabled: { field: 'promptSuggestionEnabled', fallback: 'true' },
  recap: { field: 'awaySummaryEnabled' },
  reduceMotion: { field: 'prefersReducedMotion', fallback: 'false' },
  remoteControl: { field: 'remoteControlAtStartup', fallback: 'default' },
  thinking: { field: 'alwaysThinkingEnabled' },
  timeFormat: { field: 'timeFormat', fallback: 'auto' },
  tips: { field: 'spinnerTipsEnabled', fallback: 'true' },
  turnDuration: { field: 'showTurnDuration' },
  useAutoModeDuringPlan: { field: 'useAutoModeDuringPlan', fallback: 'true' },
  verbose: { field: 'verbose', fallback: 'false' },
  workflowKeywordTriggerEnabled: { field: 'workflowKeywordTriggerEnabled', fallback: 'true' },
  worktreeBaseRef: { field: 'worktree.baseRef', fallback: 'fresh' },
};

const OBJECT = z.record(z.string(), z.unknown());

/** A JSON file's object; empty when it is missing or does not read (Claude Code may be writing it). */
function readObject(path: string): Record<string, unknown> {
  try {
    return readJson(path, OBJECT) ?? {};
  } catch {
    return {};
  }
}

/** `object`'s value at dotted `path`, as /config shows it; none when unset or not a plain value. */
function at(object: Record<string, unknown>, path: string): string | undefined {
  let value: unknown = object;
  for (const part of path.split('.'))
    value =
      value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined;
  return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : undefined;
}

/**
 * The current value of each of `keys` (the agent's own /config list) for a session in `cwd`,
 * keyed by the key; a key with no saved value and no known default is left out.
 */
export function claudeConfigValues(
  keys: readonly string[],
  cwd: string,
  env: Env,
  home: string,
): Record<string, string> {
  const global = readObject(join(env.CLAUDE_CONFIG_DIR || home, '.claude.json'));
  // Latest first: the project's local file beats its shared one, which beats the user's.
  const settings = [
    join(cwd, CLAUDE_PROJECT_DIR, 'settings.local.json'),
    join(cwd, CLAUDE_PROJECT_DIR, 'settings.json'),
    claudeSettings(home, env),
  ].map(readObject);
  const values: Record<string, string> = {};
  for (const key of keys) {
    const { field, fallback } = PLACES[key] ?? { field: key };
    const value = [global, ...settings].map((o) => at(o, field)).find((v) => v !== undefined);
    // Claude Code reads a saved `emacs` editor as normal.
    const shown = value === 'emacs' && key === 'editor' ? 'normal' : (value ?? fallback);
    if (shown !== undefined) values[key] = shown;
  }
  return values;
}
