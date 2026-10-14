import type { Mesa, PrDetail, PrList, PrPatch, PrSetupRow } from '@mesa/core';
import { commandWith } from './spec';

/** What `mesa prs start` answers: the session it opened, or the review of that PR already running. */
export type ReviewStarted = Awaited<ReturnType<Mesa['prs']['start']>>;

/** One pull request: its project and number. */
export type PrRef = { project: string; number: number };

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
  /** One PR in full: where it stands for me, my threads, my Pending drafts, and its files. */
  'prs.show': commandWith<PrRef, PrDetail>(({ project, number }) => [
    'prs',
    'show',
    '--',
    project,
    String(number),
  ]),
  /** The PR's changes as diff rows, read when its Files tab opens (mesa prs diff leaves the patch out). */
  'prs.diff': commandWith<PrRef, Omit<PrPatch, 'patch'>>(({ project, number }) => [
    'prs',
    'diff',
    '--',
    project,
    String(number),
  ]),
  /**
   * Starts a review session on the PR in a worktree at its head, or names the one running; `post`
   * is the yes to post the review as comments once written (core refuses it for non-Claude agents).
   */
  'prs.start': commandWith<PrRef & { post?: boolean }, ReviewStarted>(
    ({ project, number, post }) => [
      'prs',
      'start',
      ...(post ? ['--post'] : []),
      '--',
      project,
      String(number),
    ],
  ),
  /** Deletes one of my Pending drafts on the PR. */
  'prs.discard': commandWith<PrRef & { id: string }, { id: string }>(({ project, number, id }) => [
    'prs',
    'discard',
    '--',
    project,
    String(number),
    id,
  ]),
};
