import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { resolveCheckout } from '../projects/checkout.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import { GIT_TEXT } from '../skills/library.js';
import { gitCommand, mustGit } from './command.js';
import { cutPatch, dataFence, fillRecipe } from './recipes.js';

// Git text (CONTEXT.md, Skill run): a commit message written by a `git-text` run from the
// project's recipe, filled with the checkout's staged change; nothing is committed here.

/** What a git text run reports: the run that wrote it, how long it took, and its cost. */
export type GitTextRunInfo = { session: string; durationMs: number; costUsd?: number };
export type GitMessage = { message: string; run: GitTextRunInfo };

/** The skill run's owner (`mesa run`), as git text uses it: a project run with stdin given. */
export type GitTextRunner = (
  skill: string,
  opts: { project: string; input: string; agent?: string },
) => Promise<{
  result: {
    session: string;
    ok: boolean;
    output: string;
    durationMs: number;
    costUsd?: number;
    reason?: string;
  };
}>;

/**
 * The commit message for the checkout's staged changes, from the project's
 * `git.commitMessageRecipe` (else the profile's) with `{stagedPatch}` (cut at 200 KB),
 * `{stagedFiles}`, `{branch}` and `{recentCommits}` (the last 10 subjects) filled in, each fenced
 * as data. Refuses with usage, before any run starts, when nothing is staged.
 */
export async function writeCommitMessage(
  profile: Profile,
  run: Runner,
  runText: GitTextRunner,
  project: string,
  opts: { checkout?: string; agent?: string } = {},
): Promise<GitMessage> {
  const entry = findProject(profile, project);
  const checkout = await resolveCheckout(profile, run, project, opts.checkout);
  const files = await mustGit(
    run,
    checkout.path,
    ['diff', '--cached', '--name-status'],
    'cannot read the staged files',
  );
  if (!files.trim()) {
    throw new MesaError('usage', `nothing is staged in ${checkout.path}; stage a change first`);
  }
  const patch = await mustGit(
    run,
    checkout.path,
    ['diff', '--cached', '--no-color', '--no-ext-diff'],
    'cannot read the staged patch',
  );
  const recipe =
    readProjectFile(entry.path).git?.commitMessageRecipe ?? profile.config.git.commitMessageRecipe;
  // Every value is fenced: a file name, branch or commit subject is as anyone wrote it.
  const input = fillRecipe(recipe, {
    stagedPatch: dataFence('diff', cutPatch(patch)),
    stagedFiles: dataFence('text', files.trimEnd()),
    branch: dataFence('text', await currentBranch(run, checkout.path)),
    recentCommits: dataFence('text', await recentSubjects(run, checkout.path)),
  });
  return textOf(runText, entry.name, input, opts.agent);
}

/** The checkout's branch, or `(detached HEAD)`. */
async function currentBranch(run: Runner, path: string) {
  const branch = await gitCommand(run, path, ['branch', '--show-current']);
  return (branch.ok && branch.stdout.trim()) || '(detached HEAD)';
}

/** The last 10 commit subjects, newest first, or `(none yet)` before the first commit. */
async function recentSubjects(run: Runner, path: string) {
  const log = await gitCommand(run, path, ['log', '-10', '--format=%s']);
  return (log.ok && log.stdout.trim()) || '(none yet)';
}

/** One `git-text` run on `project` with `input` on its stdin: its answer, trimmed, and the run. */
async function textOf(runText: GitTextRunner, project: string, input: string, agent?: string) {
  const { result } = await runText(GIT_TEXT, { project, input, ...(agent ? { agent } : {}) });
  const run: GitTextRunInfo = {
    session: result.session,
    durationMs: result.durationMs,
    ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
  };
  const message = result.output.trim();
  if (!result.ok || !message) {
    throw new MesaError(
      'internal',
      `the ${GIT_TEXT} run ${result.session} wrote no text: ${result.reason ?? 'its answer was empty'}`,
      { run },
    );
  }
  return { message, run };
}
