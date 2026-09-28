import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { type Checkout, resolveCheckout } from './checkout.js';
import { gitCommand } from './command.js';
import { type DiffRow, diffRows } from './diff.js';
import { branchName, commitOid } from './ref.js';

export type GitGraphCommit = {
  oid: string;
  parents: string[];
  subject: string;
  author: string;
  authoredAt: string;
};
export type GitGraphRow = { graph: string; commit?: GitGraphCommit };
export type GitGraph = {
  checkout: Checkout;
  branch?: string;
  rows: GitGraphRow[];
  commits: number;
};
export type GitComparison = {
  checkout: Checkout;
  base: string;
  head: string;
  behind: number;
  ahead: number;
  patch: string;
  rows: DiffRow[];
};

/** Git owns the merge lanes; Mesa keeps the graph's ASCII columns and bounded commit metadata. */
export async function readGitGraph(
  profile: Profile,
  run: Runner,
  project: string,
  selected?: string,
  branch?: string,
): Promise<GitGraph> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  if (branch) {
    await branchName(run, checkout.path, branch);
    const found = await gitCommand(run, checkout.path, [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branch}`,
    ]);
    if (!found.ok) throw new MesaError('not_found', `local branch ${branch} is unavailable`);
  }
  const result = await gitCommand(
    run,
    checkout.path,
    [
      'log',
      '--graph',
      '--color=never',
      '--topo-order',
      '--max-count=100',
      '--format=%H%x00%P%x00%s%x00%an%x00%aI',
      ...(branch ? [`refs/heads/${branch}`] : ['--branches']),
    ],
    15_000,
  );
  if (!result.ok) throw new MesaError('usage', `cannot read commit graph: ${result.detail}`);
  const rows: GitGraphRow[] = result.stdout
    .trimEnd()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const marker = /[0-9a-f]{40,64}\0/.exec(line);
      if (!marker) return { graph: line };
      const graph = line.slice(0, marker.index);
      const [oid = '', parentText = '', subject = '', author = '', authoredAt = ''] = line
        .slice(marker.index)
        .split('\0');
      return {
        graph,
        commit: {
          oid,
          parents: parentText ? parentText.split(' ') : [],
          subject,
          author,
          authoredAt,
        },
      };
    });
  return {
    checkout,
    ...(branch ? { branch } : {}),
    rows,
    commits: rows.filter((row) => row.commit).length,
  };
}

/** Compare exact resolved commit OIDs, with divergence counts and one reusable patch shape. */
export async function compareGitRefs(
  profile: Profile,
  run: Runner,
  project: string,
  baseRef: string,
  headRef: string,
  selected?: string,
): Promise<GitComparison> {
  const checkout = await resolveCheckout(profile, run, project, selected);
  const [base, head] = await Promise.all([
    commitOid(run, checkout.path, baseRef),
    commitOid(run, checkout.path, headRef),
  ]);
  const [divergence, diff] = await Promise.all([
    gitCommand(run, checkout.path, ['rev-list', '--left-right', '--count', `${base}...${head}`]),
    gitCommand(
      run,
      checkout.path,
      ['diff', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames', base, head, '--'],
      30_000,
    ),
  ]);
  if (!divergence.ok) throw new MesaError('usage', `cannot compare commits: ${divergence.detail}`);
  if (!diff.ok) throw new MesaError('usage', `cannot compare commits: ${diff.detail}`);
  const [behindText = '0', aheadText = '0'] = divergence.stdout.trim().split(/\s+/);
  return {
    checkout,
    base,
    head,
    behind: Number(behindText),
    ahead: Number(aheadText),
    patch: diff.stdout,
    rows: diffRows(diff.stdout),
  };
}
