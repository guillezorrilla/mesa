import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { resolveCheckout } from '../projects/checkout.js';
import type { GitPathAction } from './changes.js';
import { gitCommand } from './command.js';
import { PATCH_FLAGS } from './diff.js';
import { DIFF_START, diffLines } from './diff-lines.js';
import { hunkRange } from './hunk-range.js';
import { literalPath } from './path.js';

/** Which hunk: its 0-based place in the path's diff, and the range it was seen with (hunkRange). */
export type HunkPick = { index: number; expect?: string };

/** A file's patch split at its `@@` lines: the header before the first, then each hunk. */
export function patchHunks(patch: string): { header: string[]; hunks: string[][] } {
  const lines = patch.replace(/\n$/, '').split('\n');
  const first = lines.findIndex((line) => line.startsWith('@@'));
  if (first < 0) return { header: lines, hunks: [] };
  const hunks: string[][] = [];
  for (const line of lines.slice(first)) {
    if (line.startsWith('@@')) hunks.push([line]);
    else hunks.at(-1)?.push(line);
  }
  // A mode change is its own change: a hunk staged alone must not bring it along.
  const header = lines.slice(0, first).filter((l) => !/^(old|new) mode /.test(l));
  return { header, hunks };
}

/** A hunk's lines on each side, as hunkRange names them. */
function rangeOf(hunk: readonly string[]): string {
  const rows = diffLines(hunk, DIFF_START).rows;
  return hunkRange(
    rows.flatMap((row) => (row.old === undefined ? [] : [row.old])),
    rows.flatMap((row) => (row.new === undefined ? [] : [row.new])),
  );
}

/**
 * Stage one hunk of the path's unstaged diff, or unstage one of its staged diff, by applying that
 * hunk alone to the index (`git apply --cached`, reversed to unstage). Git applies all or nothing,
 * so a refusal leaves the index as it was; a hunk gone, or not the range the caller saw, is refused
 * before anything is applied.
 */
export async function changeGitHunk(
  profile: Profile,
  run: Runner,
  project: string,
  selected: string | undefined,
  path: string,
  pick: HunkPick,
  action: 'stage' | 'unstage',
): Promise<GitPathAction> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const staged = action === 'unstage';
  // Fixed prefixes, as `git apply` strips one folder whatever diff.noprefix says.
  const args = ['diff', ...PATCH_FLAGS, '--src-prefix=a/', '--dst-prefix=b/'];
  const read = await gitCommand(
    run,
    checkout.path,
    [...args, ...(staged ? ['--cached'] : []), '--', literalPath(path)],
    15_000,
  );
  if (!read.ok) throw new MesaError('usage', `cannot read Git diff: ${read.detail}`);
  const { header, hunks } = patchHunks(read.stdout);
  const hunk = hunks[pick.index];
  if (!hunk)
    throw new MesaError(
      'usage',
      `${path} has no hunk ${pick.index} in its ${staged ? 'staged' : 'unstaged'} diff, which has ${hunks.length}; read the diff again`,
    );
  const range = rangeOf(hunk);
  if (pick.expect !== undefined && range !== pick.expect)
    throw new MesaError(
      'usage',
      `hunk ${pick.index} of ${path} is now ${range}, not ${pick.expect}; read the diff again`,
    );
  const applied = await gitCommand(
    run,
    checkout.path,
    ['apply', '--cached', ...(staged ? ['--reverse'] : []), '-'],
    15_000,
    undefined,
    `${[...header, ...hunk].join('\n')}\n`,
  );
  if (!applied.ok)
    throw new MesaError(
      'usage',
      `cannot ${action} hunk ${pick.index} of ${path}: ${applied.detail}`,
    );
  return { checkout, path, action, hunk: pick.index };
}
