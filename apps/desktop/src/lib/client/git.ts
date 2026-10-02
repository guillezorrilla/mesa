import type {
  Checkout,
  GitBranch,
  GitBranchAction,
  GitCommit,
  GitComparison,
  GitDiff,
  GitGraph,
  GitPathAction,
  GitStatus,
  GitSync,
  GitTracking,
  RepositoryInsight,
  StashAction,
  StashCreated,
  StashEntry,
} from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Git commands over a project's checkout. */
export const gitCommands = {
  'git.insight': commandWith<{ project: string; checkout?: string }, RepositoryInsight>(
    ({ project, checkout }) => [
      'git',
      'insight',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'git.status': commandWith<{ project: string; checkout?: string }, GitStatus>(
    ({ project, checkout }) => [
      'git',
      'status',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'git.diff': commandWith<
    { project: string; checkout?: string; path?: string; staged?: boolean; full?: boolean },
    GitDiff
  >(({ project, checkout, path, staged, full }) => [
    'git',
    'diff',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(staged ? ['--staged'] : []),
    ...(full ? ['--full'] : []),
    '--',
    project,
    ...(path ? [path] : []),
  ]),
  'git.stage': commandWith<
    { project: string; checkout?: string; path: string },
    Recorded<GitPathAction>
  >(({ project, checkout, path }) => [
    'git',
    'stage',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    path,
  ]),
  'git.unstage': commandWith<
    { project: string; checkout?: string; path: string },
    Recorded<GitPathAction>
  >(({ project, checkout, path }) => [
    'git',
    'unstage',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    path,
  ]),
  'git.commit': commandWith<
    { project: string; checkout?: string; message: string },
    Recorded<GitCommit>
  >(({ project, checkout, message }) => [
    'git',
    'commit',
    ...(checkout ? ['--checkout', checkout] : []),
    `--message=${message}`,
    '--',
    project,
  ]),
  'git.branches': commandWith<
    { project: string; checkout?: string },
    { checkout: Checkout; branches: GitBranch[] }
  >(({ project, checkout }) => [
    'git',
    'branches',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
  ]),
  'git.branchCreate': commandWith<
    { project: string; checkout?: string; name: string; base?: string },
    Recorded<GitBranchAction>
  >(({ project, checkout, name, base }) => [
    'git',
    'branch',
    'create',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(base ? ['--base', base] : []),
    '--',
    project,
    name,
  ]),
  'git.branchCheckout': commandWith<
    { project: string; checkout?: string; name: string },
    Recorded<GitBranchAction>
  >(({ project, checkout, name }) => [
    'git',
    'branch',
    'checkout',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    name,
  ]),
  'git.branchDelete': commandWith<
    { project: string; checkout?: string; name: string },
    Recorded<GitBranchAction>
  >(({ project, checkout, name }) => [
    'git',
    'branch',
    'delete',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    name,
  ]),
  'git.stashes': commandWith<
    { project: string; checkout?: string },
    { checkout: Checkout; stashes: StashEntry[] }
  >(({ project, checkout }) => [
    'git',
    'stashes',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
  ]),
  'git.stashCreate': commandWith<
    { project: string; checkout?: string; message?: string },
    Recorded<StashCreated>
  >(({ project, checkout, message }) => [
    'git',
    'stash',
    'create',
    ...(checkout ? ['--checkout', checkout] : []),
    ...(message ? [`--message=${message}`] : []),
    '--',
    project,
  ]),
  'git.stashApply': commandWith<
    { project: string; checkout?: string; ref: string; oid: string },
    Recorded<StashAction>
  >(({ project, checkout, ref, oid }) => [
    'git',
    'stash',
    'apply',
    ...(checkout ? ['--checkout', checkout] : []),
    `--oid=${oid}`,
    '--',
    project,
    ref,
  ]),
  'git.stashPop': commandWith<
    { project: string; checkout?: string; ref: string; oid: string },
    Recorded<StashAction>
  >(({ project, checkout, ref, oid }) => [
    'git',
    'stash',
    'pop',
    ...(checkout ? ['--checkout', checkout] : []),
    `--oid=${oid}`,
    '--',
    project,
    ref,
  ]),
  'git.stashDrop': commandWith<
    { project: string; checkout?: string; ref: string; oid: string },
    Recorded<StashAction>
  >(({ project, checkout, ref, oid }) => [
    'git',
    'stash',
    'drop',
    ...(checkout ? ['--checkout', checkout] : []),
    `--oid=${oid}`,
    '--',
    project,
    ref,
  ]),
  'git.tracking': commandWith<{ project: string; checkout?: string }, GitTracking>(
    ({ project, checkout }) => [
      'git',
      'tracking',
      ...(checkout ? ['--checkout', checkout] : []),
      '--',
      project,
    ],
  ),
  'git.push': commandWith<{ project: string; checkout?: string }, Recorded<GitSync>>(
    ({ project, checkout }) => [
      'git',
      'push',
      ...(checkout ? ['--checkout', checkout] : []),
      '--yes',
      '--',
      project,
    ],
  ),
  'git.pull': commandWith<{ project: string; checkout?: string }, Recorded<GitSync>>(
    ({ project, checkout }) => [
      'git',
      'pull',
      ...(checkout ? ['--checkout', checkout] : []),
      '--yes',
      '--',
      project,
    ],
  ),
  'git.graph': commandWith<{ project: string; checkout?: string; branch?: string }, GitGraph>(
    ({ project, checkout, branch }) => [
      'git',
      'graph',
      ...(checkout ? ['--checkout', checkout] : []),
      ...(branch ? ['--branch', branch] : []),
      '--',
      project,
    ],
  ),
  'git.compare': commandWith<
    { project: string; checkout?: string; base: string; head: string },
    GitComparison
  >(({ project, checkout, base, head }) => [
    'git',
    'compare',
    ...(checkout ? ['--checkout', checkout] : []),
    '--',
    project,
    base,
    head,
  ]),
};
