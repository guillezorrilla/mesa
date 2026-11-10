import { AGENTS } from '../../agents/agents.js';
import { SETUP_FAILED } from '../../agents/hooks.js';
import { shellWord } from '../../lib/process.js';
import type { SessionRecord } from '../record/record.js';

/** The window a session's `setupWhile: parallel` setup runs in, beside its agent's. */
export const setupWindowName = (id: string) => `setup-${id}`;

/**
 * The shell a setup window runs: the setup argv, as typed, then a failure logged as a
 * SETUP_FAILED hook event through `self hook`, then the person's shell in the worktree, so the
 * window stays with its output (a plain terminal).
 */
export function setupWindowCommand(
  argv: readonly string[],
  window: string,
  self: readonly string[],
  agent: SessionRecord['agent'],
) {
  // An agent with no hooks of its own still logs it: the event names no agent's state.
  const hooks = agent !== 'terminal' && AGENTS[agent].hookState ? agent : 'claude';
  const failed = JSON.stringify({ hook_event_name: SETUP_FAILED, window });
  const shown = argv.map(shellWord).join(' ');
  return [
    `printf '%s\\n' ${shellWord(`$ ${argv.join(' ')}`)}`,
    `${shown} || { status=$?; printf '%s' ${shellWord(failed)} | ${self.map(shellWord).join(' ')} hook ${hooks} >/dev/null 2>&1; printf '\\nsetup failed (exit %s)\\n' "$status"; }`,
    'exec "${SHELL:-/bin/sh}"',
  ].join('; ');
}
