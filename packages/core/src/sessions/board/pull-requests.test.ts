import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createContext } from '../../context.js';
import type { Runner } from '../../lib/process.js';
import {
  lockDeps,
  newSession,
  projectProfile,
  scriptedRunner,
  testDeps,
} from '../../testing/index.js';
import { cardState, withPullRequests } from './pull-requests.js';
import type { SessionRow } from './rows.js';

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
function setUp(auth: 'ready' | 'logged-out' = 'ready', listed = LISTED) {
  const calls: string[][] = [];
  const { run: scripted } = scriptedRunner({
    gh: (args) => {
      if (args[0] === 'auth' && auth === 'logged-out')
        return { ok: false, reason: 'failed', detail: 'not logged in' };
      if (args[0] !== 'pr') return 'gh version 2.60.0';
      const head = args[args.indexOf('--head') + 1];
      if (!args.includes('--head')) return listed;
      return JSON.stringify(head === 'old-tides' ? [pr(3, 'old-tides', 'MERGED')] : []);
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
  return { deps, calls, row, later, home };
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

test('a project that cannot be read gives its rows none, and the others still get theirs', async () => {
  const { deps, row } = setUp();
  const gone = { ...row('dddddddd', 'tides'), project: 'old-harbour' } as SessionRow;
  expect(prs(await withPullRequests(deps, [row('aaaaaaaa', 'tides'), gone]))).toEqual([
    { number: 12, state: 'draft', url: 'https://github.example/lantern-cove/pull/12' },
    undefined,
  ]);
});

/** A full page of 100 pull requests, none on the sessions' older branches. */
const FULL = JSON.stringify(Array.from({ length: 100 }, (_, i) => pr(200 + i, `new-${i}`, 'OPEN')));
const heads = (calls: string[][]) => calls.filter((args) => args.includes('--head'));

test('a branch a full list misses is asked by --head, found or not, once per 60 s', async () => {
  const { deps, calls, row, later } = setUp('ready', FULL);
  const rows = [row('aaaaaaaa', 'old-tides'), row('bbbbbbbb', 'no-pr'), row('cccccccc', 'new-3')];
  expect(prs(await withPullRequests(deps, rows))).toEqual([
    { number: 3, state: 'merged', url: 'https://github.example/lantern-cove/pull/3' },
    undefined,
    { number: 203, state: 'open', url: 'https://github.example/lantern-cove/pull/203' },
  ]);
  expect(heads(calls).map((args) => args[args.indexOf('--head') + 1])).toEqual([
    'old-tides',
    'no-pr',
  ]);
  later(30);
  expect(prs(await withPullRequests(deps, rows))[0]).toMatchObject({ number: 3 });
  expect(heads(calls)).toHaveLength(2);
  later(31);
  await withPullRequests(deps, rows);
  expect(heads(calls)).toHaveLength(4);
});

test('at most 5 branches are asked by --head in one look', async () => {
  const { deps, calls, row } = setUp('ready', FULL);
  const rows = Array.from({ length: 7 }, (_, i) => row(`s000000${i}`, `gone-${i}`));
  await withPullRequests(deps, rows);
  expect(heads(calls)).toHaveLength(5);
  await withPullRequests(deps, rows);
  expect(heads(calls)).toHaveLength(7);
});

test('a look while another lists the project reuses its claim, with no gh of its own', async () => {
  const { deps, calls, row } = setUp();
  const rows = [row('aaaaaaaa', 'tides')];
  let during: Promise<SessionRow[]> | undefined;
  const run: Runner = (file, args, ms, options) => {
    // A second look starts while the first one's gh pr list runs.
    if (file === 'gh' && args[0] === 'pr' && !during)
      during = withPullRequests({ ...deps, run }, rows);
    return deps.run(file, args, ms, options);
  };
  await withPullRequests({ ...deps, run }, rows);
  await during;
  // One look's gh in all: the second asks nothing, not even gh auth status.
  expect(calls.filter((args) => args[0] === 'pr')).toHaveLength(1);
  expect(calls.filter((args) => args[0] === 'auth')).toHaveLength(1);
  expect(prs(await withPullRequests(deps, rows))[0]).toMatchObject({ number: 12 });
});

test('a list that fails keeps the last good one, still marked cut at the limit', async () => {
  const { deps, calls, row, later } = setUp('ready', FULL);
  const rows = [row('aaaaaaaa', 'old-tides')];
  await withPullRequests(deps, rows);
  const cache = () => JSON.parse(readFileSync(deps.file, 'utf8'))['lantern-cove'];
  expect(cache().limited).toBe(true);
  later(61);
  const failing: Runner = (file, args, ms, options) =>
    file === 'gh' && args[0] === 'pr' && !args.includes('--head')
      ? Promise.resolve({ ok: false, reason: 'failed', detail: 'HTTP 502' })
      : deps.run(file, args, ms, options);
  expect(prs(await withPullRequests({ ...deps, run: failing }, rows))[0]).toMatchObject({
    number: 3,
  });
  expect(cache()).toMatchObject({ limited: true, at: deps.clock().toISOString() });
  // #3, found by --head before, is in the kept list: no new ask.
  expect(calls.filter((args) => args.includes('--head'))).toHaveLength(1);
});

test('each write drops projects no longer registered and entries over a day old', async () => {
  const { deps, row, later } = setUp();
  writeFileSync(
    deps.file,
    JSON.stringify({
      'old-harbour': { at: deps.clock().toISOString(), pullRequests: [] },
      'lantern-cove': { at: '2026-09-22T12:00:00.000Z', pullRequests: [] },
    }),
  );
  later(1);
  await withPullRequests(deps, [row('aaaaaaaa', 'tides')]);
  expect(Object.keys(JSON.parse(readFileSync(deps.file, 'utf8')))).toEqual(['lantern-cove']);
});
