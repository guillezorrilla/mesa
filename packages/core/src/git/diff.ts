import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from '../projects/checkout.js';
import { gitCommand } from './command.js';
import { DIFF_START, type DiffLine, diffLines } from './diff-lines.js';
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

/** How Mesa asks Git for a patch: no external or textconv drivers, no colour, renames found. */
export const PATCH_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-color', '--find-renames'];

/** How many lines `rows` add and remove. */
export const diffCounts = (rows: readonly DiffRow[]) => ({
  added: rows.filter((row) => row.kind === 'change' && row.newLine !== undefined).length,
  removed: rows.filter((row) => row.kind === 'change' && row.oldLine !== undefined).length,
});

/** Align consecutive removed and added lines for the side-by-side view. */
export function diffRows(patch: string): DiffRow[] {
  if (!patch) return [];
  const lines = diffLines(patch.replace(/\n$/, '').split('\n'), DIFF_START).rows;
  const rows: DiffRow[] = [];
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] as DiffLine;
    if (line.kind === 'del' || line.kind === 'add') {
      const removed: DiffLine[] = [];
      const added: DiffLine[] = [];
      while (lines[i]?.kind === 'del') removed.push(lines[i++] as DiffLine);
      while (lines[i]?.kind === 'add') added.push(lines[i++] as DiffLine);
      for (let j = 0; j < Math.max(removed.length, added.length); j++) {
        const left = removed[j];
        const right = added[j];
        rows.push({
          kind: 'change',
          left: left?.text ?? '',
          right: right?.text ?? '',
          ...(left ? { oldLine: left.old } : {}),
          ...(right ? { newLine: right.new } : {}),
        });
      }
      continue;
    }
    i++;
    if (line.kind === 'context')
      rows.push({
        kind: 'context',
        left: line.text,
        right: line.text,
        oldLine: line.old,
        newLine: line.new,
      });
    else rows.push({ kind: 'meta', left: line.text, right: line.text });
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
    ...PATCH_FLAGS,
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
