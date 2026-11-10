import { SETUP_FAILED } from '../../agents/hooks.js';
import { shellWord } from '../../lib/process.js';

/** The window a session's `setupWhile: parallel` setup runs in, beside its agent's. */
export const setupWindowName = (id: string) => `setup-${id}`;

/**
 * The shell a setup window runs: the setup argv, as typed, then a failure logged as a
 * SETUP_FAILED hook event through `self hook claude` (recordHookEvent takes it for a session of
 * any agent), then the person's shell in the worktree, so the window stays with its output.
 */
export function setupWindowCommand(
  argv: readonly string[],
  window: string,
  self: readonly string[],
) {
  const failed = JSON.stringify({ hook_event_name: SETUP_FAILED, window });
  const shown = argv.map(shellWord).join(' ');
  return [
    `printf '%s\\n' ${shellWord(`$ ${argv.join(' ')}`)}`,
    `${shown} || { status=$?; printf '%s' ${shellWord(failed)} | ${self.map(shellWord).join(' ')} hook claude >/dev/null 2>&1; printf '\\nsetup failed (exit %s)\\n' "$status"; }`,
    'exec "${SHELL:-/bin/sh}"',
  ].join('; ');
}

/**
 * `goal` with a note of the setup window running beside it, for the agent; none for no goal, or
 * one that is a slash command or skill (`/`, `$`), whose words after it are its arguments.
 */
export function notedGoal(
  goal: string | undefined,
  beside: { window: string; setup: readonly string[] } | undefined,
) {
  if (!goal || !beside || /^[/$]/.test(goal)) return goal;
  return `${goal}\n\nWorktree setup (${beside.setup.join(' ')}) is running in tmux window ${beside.window} beside this session: check it before relying on what it installs.`;
}
