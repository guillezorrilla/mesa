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

const FAILED: RunResult = { ok: false, reason: 'failed', detail: 'exit 1' };

/**
 * A git that lists `worktrees`, says `status` for a worktree's changes and `ahead` for its commits
 * past the new head, refuses to fetch into a review branch that has `diverged` from the head, takes
 * any branch name without `:`, and answers rev-parse with HEAD.
 */
function fakeGit(
  worktrees = listing(),
  opts: { status?: string; ahead?: string; diverged?: boolean; remote?: string } = {},
) {
  return scriptedRunner({
    git: (args): string | RunResult => {
      const sub = args[2];
      if (sub === 'worktree') return worktrees;
      if (sub === 'check-ref-format') return args[4]?.includes(':') ? FAILED : `${args[4]}\n`;
      if (sub === 'status') return opts.status ?? '';
      if (sub === 'rev-list') return opts.ahead ?? '';
      if (sub === 'fetch' && opts.diverged && args.at(-1)?.includes(':'))
        return { ok: false, reason: 'failed', detail: '! [rejected] (non-fast-forward)' };
      if (sub === 'rev-parse') return `${HEAD}\n`;
      if (sub === 'ls-remote') return `${opts.remote ?? HEAD}\trefs/heads/${args[4]}\n`;
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
  const stopped: string[] = [];
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
    stop: async (id: string) => {
      stopped.push(id);
    },
  };
  return { deps, opened, stopped, calls: run.calls };
}

const input = (
  fields: Partial<ReviewStartInput> = {},
  read = { headRef: 'pull/12/head', pendingDrafts: 0 },
): ReviewStartInput => ({
  project: 'lantern-cove',
  number: 12,
  post: false,
  agent: 'claude',
  read: async () => read,
  goal: (review) => `Review round ${review.round}`,
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
      'pull/12/head:review/12',
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
    const bitbucket = (headRef: string) => input({}, { headRef, pendingDrafts: 0 });
    await startReview(deps, bitbucket('feature/tide-chart'));
    expect(gitArgs(calls)).toContainEqual([
      '-C',
      PROJECT,
      'fetch',
      'origin',
      'feature/tide-chart:review/12',
    ]);
    // git refuses a refspec as a branch name, so it is never fetched.
    await expect(startReview(deps, bitbucket('x:refs/heads/main'))).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringContaining('names no head Mesa can fetch'),
    });
  });

  test('a live review session of the pull request is returned, and nothing starts', async () => {
    const { deps, opened, calls } = harness([reviewSession('l1v3r3v1', {})]);
    expect(await startReview(deps, input({ post: true }))).toEqual({
      session: 'l1v3r3v1',
      existing: true,
      mode: 'drafts',
    });
    expect(opened).toEqual([]);
    expect(calls).toEqual([]);
  });

  const idle = {
    lastState: {
      state: 'idle' as const,
      confidence: 0.95,
      at: '2026-09-24T13:00:00.000Z',
      source: 'hook' as const,
    },
  };

  test('an idle review session on the pull request head is opened again, and nothing starts', async () => {
    const { deps, opened, stopped, calls } = harness([reviewSession('1d1er3v1', {}, idle)]);
    expect(await startReview(deps, input())).toEqual({
      session: '1d1er3v1',
      existing: true,
      mode: 'drafts',
    });
    expect(gitArgs(calls).map((a) => a[2])).toEqual(['check-ref-format', 'ls-remote']);
    expect([opened, stopped]).toEqual([[], []]);
  });

  test('an idle review session the author pushed past is stopped, and round 2 starts on the new head', async () => {
    const run = fakeGit(listing({ path: WORKTREE, branch: 'review/12' }), {
      remote: 'c'.repeat(40),
    });
    const { deps, opened, stopped } = harness([reviewSession('0ldr0und', {}, idle)], run);
    const started = await startReview(deps, input());
    expect(stopped).toEqual(['0ldr0und']);
    expect(opened[0]?.opts).toMatchObject({
      checkout: WORKTREE,
      review: { round: 2 },
      parent: '0ldr0und',
    });
    expect(started).toMatchObject({ round: 2, existing: false });
  });

  test('round 2 moves the existing worktree to the new head, with the round-1 session as parent', async () => {
    const run = fakeGit(listing({ path: WORKTREE, branch: 'review/12' }));
    const { deps, opened, calls } = harness([reviewSession('r0und1aa', {}, ended)], run);
    const started = await startReview(deps, input());
    expect(gitArgs(calls)).toEqual([
      ['-C', PROJECT, 'check-ref-format', '--branch', 'pull/12/head'],
      ['-C', PROJECT, 'worktree', 'list', '--porcelain', '-z'],
      ['-C', WORKTREE, 'status', '--porcelain=v1', '-z'],
      ['-C', WORKTREE, 'fetch', 'origin', 'pull/12/head'],
      ['-C', WORKTREE, 'rev-list', 'FETCH_HEAD..HEAD'],
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
    const run = fakeGit(listing({ path: WORKTREE, branch: 'review/12' }), {
      status: ' M tide.ts\0',
    });
    const { deps, opened, calls } = harness([reviewSession('r0und1aa', {}, ended)], run);
    await expect(startReview(deps, input())).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringContaining(`the review worktree ${WORKTREE} has changes`),
    });
    expect(gitArgs(calls).some((a) => a.includes('fetch') || a.includes('switch'))).toBe(false);
    expect(opened).toEqual([]);
  });

  test('Post now is refused while I have pending drafts on the pull request, before any git runs', async () => {
    const { deps, calls } = harness();
    const pending = input({ post: true }, { headRef: 'pull/12/head', pendingDrafts: 2 });
    await expect(startReview(deps, pending)).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringContaining('2 pending drafts'),
    });
    expect(calls).toEqual([]);
  });

  test('a review/<n> worktree no review session of the pull request holds is never moved', async () => {
    const run = fakeGit(listing({ path: '/w/mine', branch: 'review/12' }));
    const { deps, opened, calls } = harness([], run);
    await expect(startReview(deps, input())).rejects.toMatchObject({
      code: 'usage',
      message: expect.stringContaining('which no review of #12 holds'),
    });
    expect(gitArgs(calls).some((a) => a.includes('fetch') || a.includes('switch'))).toBe(false);
    expect(opened).toEqual([]);
  });

  test('a review worktree with commits past the new head is not moved', async () => {
    const run = fakeGit(listing({ path: WORKTREE, branch: 'review/12' }), {
      ahead: `${'c'.repeat(40)}\n`,
    });
    const { deps, opened, calls } = harness([reviewSession('r0und1aa', {}, ended)], run);
    await expect(startReview(deps, input())).rejects.toMatchObject({
      message: expect.stringContaining('has commits that are not in the new head'),
    });
    expect(gitArgs(calls).some((a) => a.includes('switch'))).toBe(false);
    expect(opened).toEqual([]);
  });

  test('a leftover review branch moves forward to the head, and one with its own commits is refused', async () => {
    // One fetch without `+`: git makes or fast-forwards the branch, and refuses anything else.
    const forward = harness([], fakeGit(listing()));
    await startReview(forward.deps, input());
    expect(gitArgs(forward.calls).filter((a) => a[2] === 'fetch')).toEqual([
      ['-C', PROJECT, 'fetch', 'origin', 'pull/12/head:review/12'],
    ]);
    const diverged = harness([], fakeGit(listing(), { diverged: true }));
    await expect(startReview(diverged.deps, input())).rejects.toMatchObject({
      message: expect.stringContaining('has commits that are not in #12'),
    });
    expect(gitArgs(diverged.calls).some((a) => a.includes('branch'))).toBe(false);
    expect(diverged.opened).toEqual([]);
  });
});
