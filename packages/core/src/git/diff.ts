import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from '../projects/checkout.js';
import { gitCommand } from './command.js';
import { literalPath } from './path.js';

/** One aligned row; `oldLine` and `newLine` are the 1-based file lines on each side, when present. */
export type DiffRow = {
  kind: 'meta' | 'context' | 'change';
  left: string;
  right: string;
  oldLine?: number;
  newLine?: number;
};
export type GitDiff = {
  checkout: Checkout;
  staged: boolean;
  path?: string;
  patch: string;
  rows: DiffRow[];
};

/** Align consecutive removed and added lines for the side-by-side view. */
export function diffRows(patch: string): DiffRow[] {
  const lines = patch.replace(/\n$/, '').split('\n');
  if (!patch) return [];
  const rows: DiffRow[] = [];
  // Inside a hunk a `--- x` line is a removed `-- x`, not a file header.
  let inHunk = false;
  let oldLine = 0;
  let newLine = 0;
  const numbered = (left?: boolean, right?: boolean) => ({
    ...(left ? { oldLine: oldLine++ } : {}),
    ...(right ? { newLine: newLine++ } : {}),
  });
  const is = (line: string | undefined, sign: '-' | '+') => inHunk && line?.startsWith(sign);
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? '';
    if (is(line, '-')) {
      const removed: string[] = [];
      const added: string[] = [];
      while (is(lines[i], '-')) {
        removed.push((lines[i] ?? '').slice(1));
        i++;
      }
      while (is(lines[i], '+')) {
        added.push((lines[i] ?? '').slice(1));
        i++;
      }
      for (let j = 0; j < Math.max(removed.length, added.length); j++) {
        rows.push({
          kind: 'change',
          left: removed[j] ?? '',
          right: added[j] ?? '',
          ...numbered(j < removed.length, j < added.length),
        });
      }
    } else if (is(line, '+')) {
      rows.push({ kind: 'change', left: '', right: line.slice(1), ...numbered(false, true) });
      i++;
    } else if (inHunk && line.startsWith(' ')) {
      rows.push({
        kind: 'context',
        left: line.slice(1),
        right: line.slice(1),
        ...numbered(true, true),
      });
      i++;
    } else {
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
      if (hunk) {
        inHunk = true;
        oldLine = Number(hunk[1]);
        newLine = Number(hunk[2]);
      } else if (line.startsWith('diff ')) inHunk = false;
      rows.push({ kind: 'meta', left: line, right: line });
      i++;
    }
  }
  return rows;
}

export async function readGitDiff(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
  path?: string,
  staged = false,
  /** The whole file as context, so a reader can unfold every unchanged line. */
  full = false,
): Promise<GitDiff> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const args = [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--no-color',
    '--find-renames',
    ...(full ? ['--unified=1000000'] : []),
    ...(staged ? ['--cached'] : []),
    '--',
    ...(path ? [literalPath(path)] : []),
  ];
  const result = await gitCommand(run, checkout.path, args, 15_000);
  if (!result.ok) throw new MesaError('usage', `cannot read Git diff: ${result.detail}`);
  return {
    checkout,
    staged,
    ...(path ? { path } : {}),
    patch: result.stdout,
    rows: diffRows(result.stdout),
  };
}
