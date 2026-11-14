import type {
  MergeMethod,
  Mesa,
  PrDetail,
  PrList,
  PrPatch,
  PrSetupRow,
  Recorded,
  ReviewVoice,
} from '@mesa/core';
import { command, commandWith } from './spec';

/** What `mesa prs start` answers: the session it opened, or the review of that PR already running. */
export type ReviewStarted = Awaited<ReturnType<Mesa['prs']['start']>>;

/** What `mesa prs merge` answers: the PR, its method and the head it merged, with the receipt. */
export type PrMerged = Awaited<ReturnType<Mesa['prs']['merge']>>['result'] &
  Pick<Recorded<unknown>, 'receipt'>;

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
  /** Resolves one of my threads on a GitHub PR, or opens it again. */
  'prs.resolve': commandWith<
    PrRef & { thread: string; reopen?: boolean },
    { thread: string; resolved: boolean }
  >(({ project, number, thread, reopen }) => [
    'prs',
    'resolve',
    ...(reopen ? ['--reopen'] : []),
    '--',
    project,
    String(number),
    thread,
  ]),
  /**
   * Merges the PR through gh with `method` (squash by default), never with --admin; `yes` is the
   * person's confirm to merge when a check fails or it conflicts, which core refuses otherwise.
   * `auto` turns GitHub auto-merge on (with `method`) or off instead of merging now.
   */
  'prs.merge': commandWith<
    PrRef & { method?: MergeMethod; yes?: boolean; auto?: 'on' | 'off' },
    PrMerged
  >(({ project, number, method, yes, auto }) => [
    'prs',
    'merge',
    '--caller',
    'app',
    ...(auto === 'on' ? ['--auto'] : auto === 'off' ? ['--disable-auto'] : []),
    ...(method ? [`--${method}`] : []),
    ...(yes ? ['--yes'] : []),
    '--',
    project,
    String(number),
  ]),
  /** The profile's Review voice: the file review sessions write comments in, and its text when set. */
  'prs.voice': command<ReviewVoice>('prs', 'voice'),
};
