import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { githubApi } from './github.js';

// An invented merged PR read in full, in the shape `gh api graphql` prints it.
const FIXTURE = readFileSync(new URL('./fixtures/github/pr-detail.json', import.meta.url), 'utf8');

test('show reads one PR in one gh api graphql call: threads, my drafts, files and checks', async () => {
  const { run, calls } = scriptedRunner({ gh: FIXTURE });
  const read = await githubApi.show(run, 'acme/storefront', 477);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args.slice(0, 2)).toEqual(['api', 'graphql']);
  expect(calls[0]?.args).toEqual(
    expect.arrayContaining(['-f', 'owner=acme', '-f', 'name=storefront', '-F', 'number=477']),
  );
  if (!read.ok) throw new Error(read.reason);
  const detail = read.value;
  expect(detail).toMatchObject({
    me: 'ana-r',
    base: 'main',
    headRef: 'pull/477/head',
    additions: 120,
    deletions: 14,
    checks: 'failing',
    files: [
      { path: 'src/edge/cache.ts', additions: 90, deletions: 10 },
      { path: 'src/edge/purge.ts', additions: 30, deletions: 4 },
    ],
  });
  expect(detail.pr).toMatchObject({
    number: 477,
    state: 'merged',
    author: 'lee-park',
    branch: 'feat/edge-image-cache',
    // My pending comments are drafts, not events the bucket rule reads.
    reviews: [{ author: 'ana-r', state: 'changes' }],
    threads: [
      { author: 'ana-r', resolved: false },
      { author: 'ghost', resolved: true },
    ],
  });
  expect(detail.pr.comments).toHaveLength(3);
  expect(detail.threads).toEqual([
    {
      id: 'PRRT_thread1',
      author: 'ana-r',
      path: 'src/edge/cache.ts',
      line: 42,
      body: 'Should this key include the locale?',
      resolved: false,
      lastReply: { author: 'lee-park', body: 'Good catch, added it.' },
    },
    {
      id: 'PRRT_thread2',
      author: 'ghost',
      path: 'src/edge/headers.ts',
      line: null,
      body: 'Max-age looks short.',
      resolved: true,
    },
  ]);
  expect(detail.drafts).toEqual([
    { id: 'review:PRR_review1', path: null, line: null, body: 'Close; two small things.' },
    {
      id: 'PRRC_c3',
      path: 'src/edge/cache.ts',
      line: 42,
      body: 'Thanks, looks right now.',
      replyTo: 'PRRT_thread1',
    },
    { id: 'PRRC_c5', path: 'src/edge/purge.ts', line: 7, body: 'Purge on deploy too?' },
  ]);
});

test('show maps every check rollup, and none as null', async () => {
  const pr = (state: string | null) => {
    const json = JSON.parse(FIXTURE);
    json.data.repository.pullRequest.head.nodes = [
      { commit: { statusCheckRollup: state ? { state } : null } },
    ];
    return JSON.stringify(json);
  };
  const cases = [
    ['SUCCESS', 'passing'],
    ['ERROR', 'failing'],
    ['PENDING', 'pending'],
    ['EXPECTED', 'pending'],
    [null, null],
  ] as const;
  for (const [state, checks] of cases) {
    const read = await githubApi.show(
      scriptedRunner({ gh: pr(state) }).run,
      'acme/storefront',
      477,
    );
    expect(read).toMatchObject({ ok: true, value: { checks } });
  }
});

test('a failing gh and an unexpected shape are reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['gh'] });
  expect(await githubApi.show(failing.run, 'acme/storefront', 477)).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const odd = scriptedRunner({ gh: '{"data":{"repository":{}}}' });
  expect(await githubApi.show(odd.run, 'acme/storefront', 477)).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
