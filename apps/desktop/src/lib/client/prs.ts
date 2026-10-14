import type { PrList, PrSetupRow } from '@mesa/core';
import { commandWith } from './spec';

/** The Reviews tab's commands (CONTEXT.md, PR review). */
export const prsCommands = {
  /** The open PRs that need me, every project's or `project`'s; `all` adds the ones not for me. */
  prs: commandWith<{ project?: string; all?: boolean }, PrList>(({ project, all }) => [
    'prs',
    ...(project ? ['--project', project] : []),
    ...(all ? ['--all'] : []),
  ]),
  /** Each project's (or `project`'s) PR provider and whether its CLI (gh, twg) is installed and signed in. */
  'prs.setup': commandWith<{ project?: string }, PrSetupRow[]>(({ project }) => [
    'prs',
    'setup',
    ...(project ? ['--project', project] : []),
  ]),
};
