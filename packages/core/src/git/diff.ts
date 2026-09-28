import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';
import { literalPath } from './path.js';

export type DiffRow = { kind: 'meta' | 'context' | 'change'; left: string; right: string };
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
  for (let i = 0; i < lines.length; ) {
    const line = lines[i] ?? '';
    if (line.startsWith('-') && !line.startsWith('---')) {
      const removed: string[] = [];
      const added: string[] = [];
      while (lines[i]?.startsWith('-') && !lines[i]?.startsWith('---')) {
        removed.push((lines[i] ?? '').slice(1));
        i++;
      }
      while (lines[i]?.startsWith('+') && !lines[i]?.startsWith('+++')) {
        added.push((lines[i] ?? '').slice(1));
        i++;
      }
      for (let j = 0; j < Math.max(removed.length, added.length); j++) {
        rows.push({ kind: 'change', left: removed[j] ?? '', right: added[j] ?? '' });
      }
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      rows.push({ kind: 'change', left: '', right: line.slice(1) });
      i++;
    } else if (line.startsWith(' ')) {
      rows.push({ kind: 'context', left: line.slice(1), right: line.slice(1) });
      i++;
    } else {
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
): Promise<GitDiff> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const args = [
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    '--no-color',
    '--find-renames',
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
