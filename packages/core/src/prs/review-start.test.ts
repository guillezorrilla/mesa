import { describe, expect, test } from 'vitest';
import type { RunResult } from '../lib/process.js';
import type { SessionRecord, SessionReview } from '../sessions/record/record.js';
import { scriptedRunner } from '../testing/runner.js';
import { newSession } from '../testing/sessions.js';
import { type ReviewStartInput, startReview } from './review-start.js';

const PROJECT = '/src/lantern-cove';
const WORKTREE = '/w/lantern-cove/review-12';
const HEAD = 'a'.repeat(40);

/** git worktree list --porcelain -z: the project's checkout, then each linked worktree. */
const listing = (...linked: { path: string; branch: string }[]) =>
  [{ path: PROJECT, branch: 'main' }, ...linked]
    .map((w) => `worktree ${w.path}\0HEAD ${'b'.repeat(40)}\0branch refs/heads/${w.branch}\0\0`)
    .join('');

/** A git that lists `worktrees`, says `status` for a worktree's changes, and answers rev-parse with HEAD. */
function fakeGit(worktrees = listing(), status = '') {
  return scriptedRunner({
    git: (args): string | RunResult => {
      const sub = args[2];
      if (sub === 'worktree') return worktrees;
      if (sub === 'status') return status;
      if (sub === 'rev-parse') return `${HEAD}\n`;
      return '';
    },
  });
}

/** A review session record of pull request `pr` on lantern-cove. */
const reviewSession = (
  id: string,
  review: Partial<SessionReview>,
  fields: Partial<SessionRecord> = {},
): SessionRecord => ({
  id,
  events: [],
  ...newSession({
    worktree: { path: WORKTREE, branch: 'review/12' },
    review: { pr: 12, round: 1, mode: 'drafts', head: HEAD, ...review },
    ...fields,
  }),
});

const ended = {
  endedAt: '2026-09-24T13:00:00.000Z',
  lastState: {
    state: 'done' as const,
    confidence: 1,
    at: '2026-09-24T13:00:00.000Z',
    source: 'mesa' as const,
  },
};

function harness(records: SessionRecord[] = [], run = fakeGit()) {
  const opened: { project: string; opts: object }[] = [];
  const deps = {
    run: run.run,
    projectPath: PROJECT,
    sessions: () => records,
    open: async (project: string, opts: object) => {
      opened.push({ project, opts });
      const worktree = 'checkout' in opts ? WORKTREE : '/w/lantern-cove/review-12';
      return {
        result: reviewSession(
          'n3wr3v13',
          {},
          { worktree: { path: worktree, branch: 'review/12' } },
        ),
      };
    },
  };
  return { deps, opened, calls: run.calls };
}

const input = (fields: Partial<ReviewStartInput> = {}): ReviewStartInput => ({
  project: 'lantern-cove',
  number: 12,
  provider: 'github',
  post: false,
  agent: 'claude',
  goal: (round) => `Review round ${round}`,
  ...fields,
});

const gitArgs = (calls: { file: string; args: string[] }[]) =>
  calls.filter((c) => c.file === 'git').map((c) => c.args);

describe('startReview', () => {
  test('a first round fetches the pull request head into review/<n> and opens a session on that branch', async () => {
    const { deps, opened, calls } = harness();
    const started = await startReview(deps, input());
    expect(gitArgs(calls)).toContainEqual([
      '-C',
      PROJECT,
      'fetch',
      'origin',
      '+pull/12/head:review/12',
    ]);
    expect(opened).toEqual([
      {
        project: 'lantern-cove',
        opts: {
          agent: 'claude',
          branch: 'review/12',
          goal: 'Review round 1',
          review: { pr: 12, round: 1, mode: 'drafts', head: HEAD },
          noParent: true,
        },
      },
    ]);
    expect(started).toEqual({
      session: 'n3wr3v13',
      round: 1,
      mode: 'drafts',
      worktree: WORKTREE,
      head: HEAD,
      existing: false,
    });
  });

  test('a Bitbucket pull request fetches its source branch', async () => {
    const { deps, calls } = harness();
    await startReview(deps, input({ provider: 'bitbucket', sourceBranch: 'feature/tide-chart' }));
    expect(gitArgs(calls)).toContainEqual([
      '-C',
      PROJECT,
      'fetch',
      'origin',
      '+feature/tide-chart:review/12',
    ]);
    await expect(
      startReview(deps, input({ provider: 'bitbucket', sourceBranch: 'x:refs/heads/main' })),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  test('a live review session of the pull request is returned, and nothing starts', async () => {
    const { deps, opened, calls } = harness([reviewSession('l1v3r3v1', {})]);
    expect(await startReview(deps, input({ post: true }))).toEqual({
      session: 'l1v3r3v1',
      existing: true,
    });
    expect(opened).toEqual([]);
    expect(calls).toEqual([]);
  });

  test('round 2 moves the existing worktree to the new head, with the round-1 session as parent', async () => {
    const run = fakeGit(listing({ path: WORKTREE, branch: 'review/12' }));
    const { deps, opened, calls } = harness([reviewSession('r0und1aa', {}, ended)], run);
    const started = await startReview(deps, input());
    expect(gitArgs(calls)).toEqual([
      ['-C', PROJECT, 'worktree', 'list', '--porcelain', '-z'],
      ['-C', WORKTREE, 'status', '--porcelain=v1', '-z'],
      ['-C', WORKTREE, 'fetch', 'origin', 'pull/12/head'],
      ['-C', WORKTREE, 'switch', '--quiet', '-C', 'review/12', 'FETCH_HEAD'],
      ['-C', PROJECT, 'rev-parse', '--verify', '--end-of-options', 'review/12^{commit}'],
    ]);
    expect(opened[0]?.opts).toEqual({
      agent: 'claude',
      checkout: WORKTREE,
      goal: 'Review round 2',
      review: { pr: 12, round: 2, mode: 'drafts', head: HEAD },
      parent: 'r0und1aa',
    });
    expect(started).toMatchObject({ round: 2, worktree: WORKTREE, existing: false });
  });

  test('Post now is refused for an agent other than Claude, before any git runs', async () => {
    const { deps, calls } = harness();
    await expect(startReview(deps, input({ post: true, agent: 'codex' }))).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringContaining('Post now needs Claude'),
    });
    expect(calls).toEqual([]);
  });

  test('a review worktree with changes is reported, and neither fetched into nor moved', async () => {
    const run = fakeGit(listing({ path: WORKTREE, branch: 'review/12' }), ' M tide.ts\0');
    const { deps, opened, calls } = harness([reviewSession('r0und1aa', {}, ended)], run);
    await expect(startReview(deps, input())).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringContaining(`the review worktree ${WORKTREE} has changes`),
    });
    expect(gitArgs(calls).some((a) => a.includes('fetch') || a.includes('switch'))).toBe(false);
    expect(opened).toEqual([]);
  });
});
