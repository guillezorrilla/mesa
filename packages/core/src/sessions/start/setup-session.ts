import { SETUP_DONE, SETUP_FAILED } from '../../agents/hooks.js';
import { shellWord } from '../../lib/process.js';
import type { RegistryEntry } from '../../projects/registry.js';
import type { SessionRecord } from '../record/record.js';
import type { HookEvent } from '../signals/hook-events.js';

/**
 * Opens the Setup session that runs `setup` in `project`'s new worktree, its own or an additional
 * one, child of `owner`, and returns its id (open.ts setupBesideFor).
 */
export type SetupBeside = (
  owner: SessionRecord,
  setup: string[],
  project: RegistryEntry,
) => Promise<string>;

/**
 * The first command line of a Setup session (`setupWhile: parallel`): the setup argv, shown and
 * run, then its outcome logged as a SETUP_DONE or SETUP_FAILED hook event through `self hook
 * claude` (recordHookEvent takes both for a terminal session): the Board reads it (setupState),
 * and the Inbox raises a failure (hookItem).
 */
export function setupLine(argv: readonly string[], self: readonly string[]) {
  const log = (event: string) =>
    `printf '%s' ${shellWord(JSON.stringify({ hook_event_name: event }))} | ${self.map(shellWord).join(' ')} hook claude >/dev/null 2>&1`;
  return [
    `printf '%s\\n' ${shellWord(`$ ${argv.join(' ')}`)}`,
    `${argv.map(shellWord).join(' ')}`,
    `status=$?`,
    `if [ "$status" -eq 0 ]; then ${log(SETUP_DONE)}; else ${log(SETUP_FAILED)}; printf '\\nsetup failed (exit %s)\\n' "$status"; fi`,
  ].join('; ');
}

/** What a Setup session's logged setup outcome makes its state; none while the setup runs. */
export function setupState(events: readonly HookEvent[]) {
  const outcome = events.filter((e) => e.event === SETUP_DONE || e.event === SETUP_FAILED).at(-1);
  if (!outcome) return undefined;
  return {
    state: outcome.event === SETUP_FAILED ? ('failed' as const) : ('done' as const),
    at: outcome.at,
  };
}

/** The note naming a session's Setup session in the goal its agent is given. */
export const setupNote = (setupSession: string) =>
  `Worktree setup runs in your child Setup session ${setupSession} (mesa show ${setupSession} --json): check it before relying on what it installs.`;

/**
 * `goal` with setupNote, for the agent; none for no goal, or one that is a slash command or skill
 * (`/`, `$`), whose words after it are its arguments.
 */
export function notedGoal(goal: string | undefined, setupSession: string | undefined) {
  if (!goal || !setupSession || /^[/$]/.test(goal)) return goal;
  return `${goal}\n\n${setupNote(setupSession)}`;
}
