import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { resolveCheckout } from '../projects/checkout.js';
import { readProjectFile } from '../projects/project-file.js';
import { findProject } from '../projects/projects.js';
import { GIT_TEXT } from '../skills/library.js';
import { readBranchDiff } from './branch-diff.js';
import { gitCommand, mustGit } from './command.js';
import { cutPatch, dataFence, fillRecipe } from './recipes.js';
import { currentBranch } from './ref.js';

// Git text (CONTEXT.md, Skill run): a commit message, or a pull request's title and body, written
// by a `git-text` run from the project's recipe, filled with the checkout's change; nothing is
// committed or opened here.

/** What a git text run reports: the run that wrote it, how long it took, and its cost. */
export type GitTextRunInfo = { session: string; durationMs: number; costUsd?: number };
export type GitMessage = { message: string; run: GitTextRunInfo };
export type GitPullRequestText = { title: string; body: string; run: GitTextRunInfo };

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
 * `git.commitMessageRecipe` (else the profile's) with `{stagedPatch}` (cut to PATCH_LIMIT_BYTES,
 * fairly by file), `{stagedFiles}`, `{branch}` and `{recentCommits}` (the last 10 subjects) filled
 * in, each fenced as data. Refuses with usage, before any run starts, when nothing is staged.
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
  const recipe = gitRecipe(profile, entry.path, 'commitMessageRecipe');
  // Every value is fenced: a file name, branch or commit subject is as anyone wrote it.
  const input = fillRecipe(recipe, {
    stagedPatch: dataFence('diff', cutPatch(patch)),
    stagedFiles: dataFence('text', files.trimEnd()),
    branch: dataFence('text', (await currentBranch(run, checkout.path)) ?? '(detached HEAD)'),
    recentCommits: dataFence('text', await recentSubjects(run, checkout.path)),
  });
  return textOf(runText, entry.name, input, opts.agent);
}

/**
 * A pull request's title and body for the checkout's branch, from the project's
 * `git.pullRequestRecipe` (else the profile's) with `{branchPatch}` (everything since the
 * merge-base with `base`, the project's default branch unless given, cut to PATCH_LIMIT_BYTES,
 * fairly by file), `{commits}` (their subjects and bodies, oldest first), `{branch}` and `{base}`
 * filled in, each fenced as data. Refuses with usage, before any run starts, when the branch has
 * no commits past its base and no changes.
 */
export async function writePullRequestText(
  profile: Profile,
  run: Runner,
  runText: GitTextRunner,
  project: string,
  opts: { checkout?: string; base?: string; agent?: string } = {},
): Promise<GitPullRequestText> {
  const entry = findProject(profile, project);
  const diff = await readBranchDiff(profile, run, project, opts.base, opts.checkout);
  if (diff.ahead === 0 && !diff.patch.trim()) {
    throw new MesaError(
      'usage',
      `${diff.branch ?? 'HEAD'} has no commits past ${diff.base} and no changes to describe`,
    );
  }
  const commits = await mustGit(
    run,
    diff.checkout.path,
    ['log', '--reverse', '--format=%s%n%n%b', `${diff.mergeBase}..HEAD`],
    'cannot read the branch commits',
  );
  const recipe = gitRecipe(profile, entry.path, 'pullRequestRecipe');
  const input = fillRecipe(recipe, {
    branchPatch: dataFence('diff', cutPatch(diff.patch)),
    commits: dataFence('text', commits.trim() || '(none yet: the changes are not committed)'),
    branch: dataFence('text', diff.branch ?? '(detached HEAD)'),
    base: dataFence('text', diff.base),
  });
  const { message, run: info } = await textOf(runText, entry.name, input, opts.agent);
  return { ...splitTitle(message), run: info };
}

/** The recipe a project's runs follow: its mesa.yaml's, else the profile's. */
const gitRecipe = (
  profile: Profile,
  dir: string,
  key: 'commitMessageRecipe' | 'pullRequestRecipe',
) => readProjectFile(dir).git?.[key] ?? profile.config.git[key];

/**
 * An answer's first line, without a Markdown heading's `# ` or a `Title:`, as the title, and the
 * rest as the body; a `Title:` alone on its line takes the next line as the title.
 */
export function splitTitle(text: string) {
  const lines = text.trim().replaceAll('\r\n', '\n').split('\n');
  const label = /^(#+\s+)?title:\s*$/i.test(lines[0] ?? '') ? 1 : 0;
  const [first = '', ...rest] = lines.slice(label);
  const title = first
    .replace(/^#+\s+/, '')
    .replace(/^title:\s*/i, '')
    .trim();
  return { title, body: rest.join('\n').trim() };
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
