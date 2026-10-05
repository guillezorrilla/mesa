import { join } from 'node:path';
import { type Env, shellWord } from '../../lib/process.js';
import { read } from '../hooks.js';
import { CLAUDE_PROJECT_DIR, claudeSettings } from './paths.js';

// Claude Code's statusLine setting: the one Mesa hands a session's claude per launch, and the
// user's own, which Mesa's runs first. Claude runs the command in a shell with its session's JSON
// on stdin and shows what it prints (code.claude.com/docs/en/statusline).

/** The mesa subcommand Claude runs as its status line. */
export const STATUS_LINE_COMMAND = 'statusline';

/**
 * Set for the user's own status line command: a Mesa status line under it, of any mesa (the CLI's
 * or the app's), prints nothing, so the cost never shows twice and Mesa never runs itself.
 */
export const NESTED_STATUS_LINE_VAR = 'MESA_STATUS_LINE';

/** This mesa's `statusline` as a shell command line, from the argv that runs it (MesaDeps.self). */
export const mesaStatusLineCommand = (self: readonly string[]) =>
  [...self.map(shellWord), STATUS_LINE_COMMAND].join(' ');

/**
 * The launch command with this mesa's status line in a per-launch `--settings`, which Claude
 * layers over the user's settings without writing them. It goes right after `claude`, before a
 * goal, as one shell word in the `=` form.
 */
export const withMesaStatusLine = (command: string, self: readonly string[]) => {
  const settings = { statusLine: { type: 'command', command: mesaStatusLineCommand(self) } };
  return command.replace(
    /^claude /,
    `claude ${shellWord(`--settings=${JSON.stringify(settings)}`)} `,
  );
};

/**
 * The user's own statusLine command, in Claude's precedence: the project's local settings, its
 * shared settings, then the user's. This mesa's own is never the user's (and any other mesa's
 * prints nothing under NESTED_STATUS_LINE_VAR).
 */
export function userStatusLineCommand(
  home: string,
  env: Env,
  project: string,
  self: readonly string[],
) {
  const files = [
    join(project, CLAUDE_PROJECT_DIR, 'settings.local.json'),
    join(project, CLAUDE_PROJECT_DIR, 'settings.json'),
    claudeSettings(home, env),
  ];
  for (const file of files) {
    let statusLine: unknown;
    try {
      statusLine = read(file).settings.statusLine;
    } catch {
      continue;
    }
    if (!statusLine || typeof statusLine !== 'object') continue;
    const { type, command } = statusLine as { type?: unknown; command?: unknown };
    if (type !== 'command' || typeof command !== 'string' || !command.trim()) continue;
    return command === mesaStatusLineCommand(self) ? undefined : command;
  }
  return undefined;
}
