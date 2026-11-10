import { expect, test } from 'vitest';
import { createContext } from '../context.js';
import type { Runner } from '../lib/process.js';
import type { SessionRow } from '../sessions/board/rows.js';
import {
  lockDeps,
  newSession,
  projectProfile,
  scriptedRunner,
  testDeps,
} from '../testing/index.js';
import { cardState, withPullRequests } from './branch-pull-requests.js';

const pr = (number: number, branch: string, state: string, extra: object = {}) => ({
  number,
  title: `Change ${number}`,
  url: `https://github.example/lantern-cove/pull/${number}`,
  state,
  isDraft: false,
  headRefName: branch,
  isCrossRepository: false,
  updatedAt: '2026-09-24T12:00:00Z',
  mergedAt: null,
  closedAt: null,
  ...extra,
});
const LISTED = JSON.stringify([
  pr(12, 'tides', 'OPEN', { isDraft: true }),
  pr(9, 'berths', 'MERGED', { mergedAt: '2026-09-23T12:00:00Z' }),
  pr(7, 'harbour', 'OPEN', { isCrossRepository: true }),
]);

/** lantern-cove, gh answering as `gh` does, its calls counted, and a clock the test moves. */
function setUp(auth: 'ready' | 'logged-out' = 'ready') {
  const calls: string[][] = [];
  const { run: scripted } = scriptedRunner({
    gh: (args) => {
      if (args[0] === 'auth' && auth === 'logged-out')
        return { ok: false, reason: 'failed', detail: 'not logged in' };
      return args[0] === 'pr' ? LISTED : 'gh version 2.60.0';
    },
  });
  const run: Runner = (file, args, ms, options) => {
    if (file === 'gh') calls.push(args);
    return scripted(file, args, ms, options);
  };
  const { home } = projectProfile(run, { mesaYaml: 'name: lantern-cove\n' });
  const ctx = createContext('default', testDeps(home, { run }));
  let now = new Date('2026-09-24T12:00:00.000Z');
  const deps = {
    ...lockDeps(),
    clock: () => now,
    run,
    profile: ctx.open,
    file: `${home}/pr-branches.json`,
  };
  const row = (id: string, branch: string) =>
    ({ ...newSession(), id, gitBranch: branch, managed: true }) as unknown as SessionRow;
  const later = (seconds: number) => {
    now = new Date(now.getTime() + seconds * 1000);
  };
  return { deps, calls, row, later };
}
const prs = (rows: SessionRow[]) => rows.map((row) => (row as { pr?: unknown }).pr);

test('a pull request reads as open, draft, merged or closed', () => {
  expect(
    [
      { state: 'OPEN', isDraft: false },
      { state: 'OPEN', isDraft: true },
      { state: 'MERGED', isDraft: false },
      { state: 'CLOSED', isDraft: true },
    ].map((each) => cardState(each as Parameters<typeof cardState>[0])),
  ).toEqual(['open', 'draft', 'merged', 'closed']);
});

test("each session gets its branch's pull request, never a fork's, from one gh pr list kept 60 s", async () => {
  const { deps, calls, row, later } = setUp();
  const rows = [row('aaaaaaaa', 'tides'), row('bbbbbbbb', 'berths'), row('cccccccc', 'harbour')];
  expect(prs(await withPullRequests(deps, rows))).toEqual([
    { number: 12, state: 'draft', url: 'https://github.example/lantern-cove/pull/12' },
    { number: 9, state: 'merged', url: 'https://github.example/lantern-cove/pull/9' },
    undefined,
  ]);
  expect(calls.filter((args) => args[0] === 'pr')).toHaveLength(1);
  later(59);
  await withPullRequests(deps, rows);
  expect(calls.filter((args) => args[0] === 'pr')).toHaveLength(1);
  later(2);
  await withPullRequests(deps, rows);
  expect(calls.filter((args) => args[0] === 'pr')).toHaveLength(2);
});

test('gh logged out gives no pull request and no error, and is asked again only after 60 s', async () => {
  const { deps, calls, row, later } = setUp('logged-out');
  const rows = [row('aaaaaaaa', 'tides')];
  expect(prs(await withPullRequests(deps, rows))).toEqual([undefined]);
  const asked = calls.length;
  await withPullRequests(deps, rows);
  expect(calls).toHaveLength(asked);
  later(61);
  await withPullRequests(deps, rows);
  expect(calls.length).toBeGreaterThan(asked);
  expect(calls.some((args) => args[0] === 'pr')).toBe(false);
});
