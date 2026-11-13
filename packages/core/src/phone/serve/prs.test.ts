import { expect, test } from 'vitest';
import { MesaError } from '../../lib/result.js';
import type { PrEventsDelivered } from '../../pr-events/pr-event-delivery.js';
import type { PrDetail } from '../../prs/service.js';
import { multiProjectSession, newSession, placedRow } from '../../testing/sessions.js';
import type { PrsCall } from '../protocol/prs.js';
import { type CallResult, callResults } from '../protocol/rpc.js';
import { answerPrs, type PrsDeps } from './prs.js';

// Invented PRs: Lee's tide-pool #7 on `feature`, which a live session's worktree is on.

const PATCH = [
  'diff --git a/src/tide.ts b/src/tide.ts',
  '--- a/src/tide.ts',
  '+++ b/src/tide.ts',
  '@@ -1 +1,2 @@',
  ' export const tide = 1;',
  '+export const flood = 4;',
  '',
].join('\n');

const DETAIL = {
  project: 'tide-pool',
  provider: 'github',
  number: 7,
  title: 'Raise the flood line',
  url: 'https://github.com/example/tide-pool/pull/7',
  branch: 'feature',
  updatedAt: '2026-11-12T10:00:00Z',
  author: 'lee-park',
  bucket: 'need',
  since: { lastWord: null, commits: 0, replies: 0, resolved: 0, threads: 1 },
  state: 'open',
  body: 'Raises it.',
  base: 'main',
  headRef: 'pull/7/head',
  additions: 1,
  deletions: 0,
  checks: 'failing',
  checkList: [{ name: 'lint', state: 'failing', url: 'https://ci.example.com/1' }],
  threads: [
    {
      id: 'T1',
      author: 'ana-r',
      path: 'src/tide.ts',
      line: 2,
      body: 'Name it?',
      resolved: false,
      verdict: { state: 'partly', round: 2 },
    },
  ],
  drafts: [{ id: 'D1', path: null, line: null, body: 'Looks right.' }],
  files: [{ path: 'src/tide.ts', additions: 1, deletions: 0 }],
} as PrDetail;

const owner = placedRow({ id: 'own1', ...multiProjectSession() } as never, 'idle');
const review = placedRow(
  {
    id: 'rev1',
    ...newSession({
      project: 'tide-pool',
      review: { pr: 7, round: 2, mode: 'drafts', head: 'c'.repeat(40) },
    }),
  } as never,
  'working',
);

function fakeDeps(over: Partial<PrsDeps> = {}) {
  const asked: unknown[][] = [];
  const keep =
    <T>(name: string, value: T) =>
    async (...args: unknown[]) => {
      asked.push([name, ...args]);
      return value;
    };
  const deps: PrsDeps = {
    list: async () => ({
      prs: [{ ...DETAIL, bucket: 'need' }],
      blocked: [
        {
          project: 'atlas',
          provider: 'bitbucket',
          cli: 'twg',
          state: 'unauthenticated',
          next: 'twg login',
        },
      ],
      problems: [{ project: 'reef', reason: 'gh timed out' }],
      quiet: [],
    }),
    show: async () => DETAIL,
    diff: keep('diff', { patch: PATCH }),
    start: keep('start', { session: 'rev2', existing: false, mode: 'post' }),
    discard: keep('discard', { result: { id: 'D1' } }),
    draft: keep('draft', { result: { id: 'D2' } }),
    resolve: keep('resolve', { result: { resolved: true } }),
    merge: keep('merge', { result: { method: 'rebase', head: 'c0ffee1' } }),
    deliver: keep<PrEventsDelivered>('deliver', {
      gh: { state: 'ready', version: '2.62.0' },
      problems: [],
      deliveries: [
        { session: 'own1', status: 'delivered', state: 'idle', confidence: 0.95, events: ['e1'] },
      ],
    }),
    board: async () => [owner, review],
    ...over,
  };
  return { deps, asked };
}

/** The call's answer, checked against the schema the phone checks it with. */
async function ask<M extends PrsCall['method']>(
  deps: PrsDeps,
  call: Extract<PrsCall, { method: M }>,
): Promise<CallResult<M>> {
  return callResults[call.method].parse(await answerPrs(deps, call)) as CallResult<M>;
}

const PR = { project: 'tide-pool', number: 7 };

test('the queue lists each PR in its bucket and says which projects could not be read', async () => {
  const { deps } = fakeDeps();
  expect(await ask(deps, { method: 'prs' })).toEqual({
    prs: [
      {
        project: 'tide-pool',
        number: 7,
        title: 'Raise the flood line',
        author: 'lee-park',
        branch: 'feature',
        bucket: 'need',
        updatedAt: '2026-11-12T10:00:00Z',
        url: 'https://github.com/example/tide-pool/pull/7',
      },
    ],
    problems: ['atlas: twg is not ready (twg login)', 'reef: gh timed out'],
  });
});

test('one PR carries its description, checks, threads with verdicts, drafts, owner and review', async () => {
  const { deps } = fakeDeps();
  expect(await ask(deps, { method: 'pr', ...PR })).toMatchObject({
    body: 'Raises it.',
    files: 1,
    checks: 'failing',
    checkList: [{ name: 'lint', state: 'failing', url: 'https://ci.example.com/1' }],
    threads: [{ id: 'T1', resolved: false, verdict: 'partly' }],
    drafts: [{ id: 'D1', path: null, body: 'Looks right.' }],
    // The session on tide-pool's `feature` (an additional project's worktree), not the review.
    owner: 'own1',
    review: { session: 'rev1', mode: 'drafts', working: true },
  });
});

test('a PR from a Mac before #1134, with no file count, still reads', async () => {
  const { deps } = fakeDeps();
  const { files: _, ...older } = await ask(deps, { method: 'pr', ...PR });
  expect(callResults.pr.parse(older).files).toBeUndefined();
});

test('the files and their pages come from the PR patch, a page of a changed patch refused', async () => {
  const { deps, asked } = fakeDeps();
  const { files, ...changes } = await ask(deps, { method: 'prChanges', ...PR });
  expect(changes).toEqual({ base: 'main', branch: 'feature', omitted: 0 });
  expect(files).toEqual([{ path: 'src/tide.ts', added: 1, removed: 0, rev: expect.any(String) }]);
  const rev = files[0]?.rev ?? '';
  const page = await ask(deps, { method: 'prDiff', ...PR, path: 'src/tide.ts', rev, from: 0 });
  expect(page).toMatchObject({ from: 0, total: 6 });
  // The list reads anew; a page takes the read kept from just before.
  expect(asked.filter((a) => a[0] === 'diff')).toEqual([
    ['diff', 'tide-pool', 7],
    ['diff', 'tide-pool', 7, true],
  ]);
  await expect(
    answerPrs(deps, { method: 'prDiff', ...PR, path: 'src/tide.ts', rev: 'old', from: 0 }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

test('start, discard, reply, resolve and merge each go through core as the phone', async () => {
  const { deps, asked } = fakeDeps();
  expect(await ask(deps, { method: 'prStart', ...PR, post: true })).toEqual({
    session: 'rev2',
    existing: false,
    mode: 'post',
  });
  await ask(deps, { method: 'prDiscard', ...PR, draft: 'D1' });
  expect(await ask(deps, { method: 'prReply', ...PR, thread: 'T1', text: 'Fixed?' })).toEqual({
    id: 'D2',
  });
  await ask(deps, { method: 'prResolve', ...PR, thread: 'T1', resolved: true });
  expect(await ask(deps, { method: 'prMerge', ...PR, how: 'rebase', confirm: true })).toEqual({
    how: 'rebase',
    head: 'c0ffee1',
  });
  expect(asked).toEqual([
    ['start', 'tide-pool', 7, { post: true }],
    ['discard', 'tide-pool', 7, 'D1'],
    ['draft', 'tide-pool', 7, { text: 'Fixed?', replyTo: 'T1' }],
    ['resolve', 'tide-pool', 7, 'T1', true],
    ['merge', PR, { method: 'rebase', confirm: true, caller: 'phone' }],
  ]);
});

test('a merge core refuses until confirmed comes back as the refusal, for the phone to ask', async () => {
  const { deps } = fakeDeps({
    merge: async () => {
      throw new MesaError('usage', 'tide-pool #7 conflicts with its base', {
        refused: 'conflicting',
        checks: 'passing',
        mergeable: 'conflicting',
      });
    },
  });
  expect(await ask(deps, { method: 'prMerge', ...PR, how: 'squash', confirm: false })).toEqual({
    refused: 'conflicting',
  });
  const broken = fakeDeps({
    merge: async () => {
      throw new MesaError('internal', 'gh failed');
    },
  });
  await expect(
    answerPrs(broken.deps, { method: 'prMerge', ...PR, how: 'squash', confirm: true }),
  ).rejects.toThrow('gh failed');
});

test('a failed check goes to the session on the branch, or says why nothing went', async () => {
  const sent = fakeDeps();
  expect(await ask(sent.deps, { method: 'prSend', ...PR })).toEqual({
    status: 'delivered',
    session: 'own1',
  });
  const busy = fakeDeps({
    deliver: async (): Promise<PrEventsDelivered> => ({
      gh: { state: 'ready', version: '2.62.0' },
      problems: [],
      deliveries: [
        {
          session: 'own1',
          status: 'waiting',
          state: 'working',
          confidence: 0.9,
          reason: 'it is working',
          events: ['e1'],
        },
      ],
    }),
  });
  expect(await ask(busy.deps, { method: 'prSend', ...PR })).toEqual({
    status: 'waiting',
    session: 'own1',
    reason: 'it is working',
  });
  const nobody = fakeDeps({ board: async () => [review] });
  expect(await ask(nobody.deps, { method: 'prSend', ...PR })).toEqual({
    status: 'nothing',
    reason: 'no live session works on this branch',
  });
});
