import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { githubApi } from './github.js';

type Review = { id: string; body: string };

/** A gh that answers each GraphQL operation by name, for an invented PR and my pending review. */
function fakeGh(pending: Review | null, comments = 0) {
  const answer = (args: string[]) => {
    const query = args[3] ?? '';
    const vars = Object.fromEntries(
      args.flatMap((a, i) =>
        args[i - 1] === '-f' || args[i - 1] === '-F' ? [a.split(/=(.*)/s)] : [],
      ),
    );
    const data = (d: unknown) => JSON.stringify({ data: d });
    if (query.includes('pending: reviews'))
      return data({
        repository: { pullRequest: { id: 'PR_1', pending: { nodes: pending ? [pending] : [] } } },
      });
    if (query.includes('addPullRequestReview('))
      return data({
        addPullRequestReview: { pullRequestReview: { id: 'PRR_new', body: vars.body ?? '' } },
      });
    if (query.includes('addPullRequestReviewThread('))
      return data({
        addPullRequestReviewThread: {
          thread: {
            comments: {
              nodes: [
                { id: 'PRRC_new', path: vars.path, line: Number(vars.line), body: vars.body },
              ],
            },
          },
        },
      });
    if (query.includes('addPullRequestReviewThreadReply('))
      return data({
        addPullRequestReviewThreadReply: {
          comment: { id: 'PRRC_reply', path: 'src/a.ts', line: 3, body: vars.body },
        },
      });
    if (query.includes('updatePullRequestReview('))
      return data({
        updatePullRequestReview: {
          pullRequestReview: {
            id: vars.review,
            body: vars.body,
            comments: { totalCount: comments },
          },
        },
      });
    if (query.includes('deletePullRequestReviewComment('))
      return data({ deletePullRequestReviewComment: { clientMutationId: null } });
    if (query.includes('deletePullRequestReview('))
      return data({ deletePullRequestReview: { pullRequestReview: { id: vars.review } } });
    return { ok: false as const, reason: 'failed' as const, detail: 'unexpected call' };
  };
  return scriptedRunner({ gh: answer });
}

const operations = (calls: { args: string[] }[]) =>
  calls.map((c) => /(?:query|mutation)[^{]*\{\s*(\w+)/.exec(c.args[3] ?? '')?.[1]);

// Nothing here may post, approve or submit (ADR-0024).
function expectNothingSubmitted(calls: { file: string; args: string[] }[]) {
  for (const c of calls) {
    expect(c.file).toBe('gh');
    expect(c.args.slice(0, 2)).toEqual(['api', 'graphql']);
    const all = c.args.join(' ');
    for (const banned of ['event', 'submitPullRequestReview', 'pr review', 'pr comment'])
      expect(all).not.toContain(banned);
  }
}

test('an inline draft starts my pending review when I have none, then adds a thread to it', async () => {
  const { run, calls } = fakeGh(null);
  const read = await githubApi.draft(run, 'acme/storefront', 477, {
    text: 'Include the locale?',
    path: 'src/edge/cache.ts',
    line: 42,
  });
  expect(read).toEqual({
    ok: true,
    value: { id: 'PRRC_new', path: 'src/edge/cache.ts', line: 42, body: 'Include the locale?' },
  });
  expect(operations(calls)).toEqual([
    'repository',
    'addPullRequestReview',
    'addPullRequestReviewThread',
  ]);
  expect(calls[1]?.args).not.toEqual(expect.arrayContaining([expect.stringMatching(/^body=/)]));
  expect(calls[2]?.args).toEqual(
    expect.arrayContaining([
      '-f',
      'review=PRR_new',
      '-f',
      'path=src/edge/cache.ts',
      '-F',
      'line=42',
    ]),
  );
  expect(calls[2]?.args[3]).toContain('side: RIGHT');
  expectNothingSubmitted(calls);
});

test('a reply goes into the pending review I already have, on the thread it answers', async () => {
  const { run, calls } = fakeGh({ id: 'PRR_mine', body: '' });
  const read = await githubApi.draft(run, 'acme/storefront', 477, {
    text: 'Agreed.',
    replyTo: 'PRRT_thread1',
  });
  expect(read).toEqual({
    ok: true,
    value: {
      id: 'PRRC_reply',
      path: 'src/a.ts',
      line: 3,
      body: 'Agreed.',
      replyTo: 'PRRT_thread1',
    },
  });
  expect(operations(calls)).toEqual(['repository', 'addPullRequestReviewThreadReply']);
  expect(calls[1]?.args).toEqual(
    expect.arrayContaining(['-f', 'review=PRR_mine', '-f', 'thread=PRRT_thread1']),
  );
  expectNothingSubmitted(calls);
});

test('a summary starts the pending review with it, or appends to the one I wrote', async () => {
  const fresh = fakeGh(null);
  expect(await githubApi.draft(fresh.run, 'acme/storefront', 477, { text: 'Close.' })).toEqual({
    ok: true,
    value: { id: 'review:PRR_new', path: null, line: null, body: 'Close.' },
  });
  expect(operations(fresh.calls)).toEqual(['repository', 'addPullRequestReview']);
  expect(fresh.calls[1]?.args).toEqual(expect.arrayContaining(['-f', 'body=Close.']));

  const more = fakeGh({ id: 'PRR_mine', body: 'Close.' });
  const read = await githubApi.draft(more.run, 'acme/storefront', 477, { text: 'One nit.' });
  expect(read).toMatchObject({
    ok: true,
    value: { id: 'review:PRR_mine', body: 'Close.\n\nOne nit.' },
  });
  expect(operations(more.calls)).toEqual(['repository', 'updatePullRequestReview']);
  expectNothingSubmitted([...fresh.calls, ...more.calls]);
});

test('a summary for a pending review started without one is reported: GitHub refuses it', async () => {
  const { run, calls } = fakeGh({ id: 'PRR_mine', body: '' });
  const read = await githubApi.draft(run, 'acme/storefront', 477, { text: 'Close.' });
  expect(read).toMatchObject({ ok: false, reason: 'failed' });
  expect(operations(calls)).toEqual(['repository']);
});

test('discard deletes a draft comment, or clears the summary and drops a review left empty', async () => {
  const comment = fakeGh(null);
  expect(await githubApi.discard(comment.run, 'acme/storefront', 477, 'PRRC_c5')).toEqual({
    ok: true,
    value: { id: 'PRRC_c5' },
  });
  expect(operations(comment.calls)).toEqual(['deletePullRequestReviewComment']);
  expect(comment.calls[0]?.args).toEqual(expect.arrayContaining(['-f', 'id=PRRC_c5']));

  const withDrafts = fakeGh(null, 2);
  await githubApi.discard(withDrafts.run, 'acme/storefront', 477, 'review:PRR_mine');
  expect(operations(withDrafts.calls)).toEqual(['updatePullRequestReview']);
  expect(withDrafts.calls[0]?.args).toEqual(
    expect.arrayContaining(['-f', 'review=PRR_mine', '-f', 'body=']),
  );

  const empty = fakeGh(null, 0);
  expect(await githubApi.discard(empty.run, 'acme/storefront', 477, 'review:PRR_mine')).toEqual({
    ok: true,
    value: { id: 'review:PRR_mine' },
  });
  expect(operations(empty.calls)).toEqual(['updatePullRequestReview', 'deletePullRequestReview']);
  expectNothingSubmitted([...comment.calls, ...withDrafts.calls, ...empty.calls]);
});

test('a failing gh is reported, never thrown, and stops before any write', async () => {
  const failing = scriptedRunner({}, { failing: ['gh'] });
  expect(
    await githubApi.draft(failing.run, 'acme/storefront', 477, { text: 'x', path: 'a', line: 1 }),
  ).toMatchObject({ ok: false, reason: 'failed' });
  expect(failing.calls).toHaveLength(1);
  expect(await githubApi.discard(failing.run, 'acme/storefront', 477, 'PRRC_c5')).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const odd = scriptedRunner({ gh: '{"data":{}}' });
  expect(await githubApi.draft(odd.run, 'acme/storefront', 477, { text: 'x' })).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
