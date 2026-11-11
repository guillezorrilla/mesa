import { SETUP_FAILED } from '../../agents/hooks.js';
import { shellWord } from '../../lib/process.js';
import type { RegistryEntry } from '../../projects/registry.js';
import type { SessionRecord } from '../record/record.js';

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
 * run, then a failure logged as a SETUP_FAILED hook event through `self hook claude`
 * (recordHookEvent takes it for a terminal session), which the Inbox raises (hookItem).
 */
export function setupLine(argv: readonly string[], self: readonly string[]) {
  const failed = JSON.stringify({ hook_event_name: SETUP_FAILED });
  return [
    `printf '%s\\n' ${shellWord(`$ ${argv.join(' ')}`)}`,
    `${argv.map(shellWord).join(' ')} || { status=$?; printf '%s' ${shellWord(failed)} | ${self.map(shellWord).join(' ')} hook claude >/dev/null 2>&1; printf '\\nsetup failed (exit %s)\\n' "$status"; }`,
  ].join('; ');
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
