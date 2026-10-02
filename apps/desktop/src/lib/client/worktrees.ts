import type { WorktreeAction, WorktreeDetails, WorktreePreview, WorktreeRow } from '@mesa/core';
import { commandWith, type Recorded } from './spec';

/** Worktree commands: a project's linked worktrees and their actions. */
export const worktreesCommands = {
  'worktrees.list': commandWith<{ project: string }, (WorktreeRow & WorktreeDetails)[]>(
    ({ project }) => ['worktrees', 'list', '--', project],
  ),
  /** What a remove, recycle, trash, or cleanup would touch, with the token its apply needs. */
  'worktrees.preview': commandWith<
    { project: string; action: WorktreeAction; path?: string },
    WorktreePreview
  >(({ project, action, path }) => [
    'worktrees',
    'preview',
    `--action=${action}`,
    '--',
    project,
    ...(path ? [path] : []),
  ]),
  'worktrees.apply': commandWith<
    {
      project: string;
      action: WorktreeAction;
      token: string;
      path?: string;
      force?: boolean;
      deleteBranch?: boolean;
    },
    Recorded<{
      action: WorktreeAction;
      paths: string[];
      branch?: string;
      base?: string;
      fetchFailed?: boolean;
      branchKept?: string;
      remaining?: string[];
    }>
  >(({ project, action, token, path, force, deleteBranch }) => [
    'worktrees',
    'apply',
    `--action=${action}`,
    `--token=${token}`,
    ...(force ? ['--force'] : []),
    ...(deleteBranch ? ['--delete-branch'] : []),
    '--',
    project,
    ...(path ? [path] : []),
  ]),
};
