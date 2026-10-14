import { expect, test } from 'vitest';
import type { RunResult } from '../lib/process.js';
import { scriptedRunner } from '../testing/runner.js';
import { githubApi } from './github.js';

const REPO = 'acme/atlas';

/** A gh with an invented PR and, if any, my pending review with a summary and two comments. */
function fakeGh(pending: boolean, submit: 'ok' | 'fails' = 'ok') {
  return scriptedRunner({
    gh: (args): string | RunResult => {
      const query = args[3] ?? '';
      if (query.includes('pending: reviews'))
        return JSON.stringify({
          data: {
            repository: {
              pullRequest: {
                id: 'PR_1',
                pending: {
                  nodes: pending
                    ? [
                        {
                          id: 'PRR_7',
                          body: 'Two small things, otherwise fine.',
                          comments: { nodes: [{ id: 'PRRC_1' }, { id: 'PRRC_2' }] },
                        },
                      ]
                    : [],
                },
              },
            },
          },
        });
      if (query.includes('submitPullRequestReview(') && submit === 'ok')
        return JSON.stringify({
          data: { submitPullRequestReview: { pullRequestReview: { id: 'PRR_7' } } },
        });
      return { ok: false, reason: 'failed', detail: 'exit 1' };
    },
  });
}

const PENDING_VARS = ['-f', 'owner=acme', '-f', 'name=atlas', '-F', 'number=214'];

test('publish submits my pending review once, with event COMMENT', async () => {
  const { run, calls } = fakeGh(true);
  expect(await githubApi.publish(run, REPO, 214)).toEqual({ ok: true, value: { published: 3 } });
  expect(calls.map((c) => [c.file, ...c.args.slice(0, 3), ...c.args.slice(4)])).toEqual([
    ['gh', 'api', 'graphql', '-f', ...PENDING_VARS],
    ['gh', 'api', 'graphql', '-f', '-f', 'review=PRR_7'],
  ]);
  const submits = calls.filter((c) => c.args[3]?.includes('submitPullRequestReview('));
  expect(submits).toHaveLength(1);
  expect(submits[0]?.args[3]).toContain(
    'submitPullRequestReview(input: {pullRequestReviewId: $review, event: COMMENT})',
  );
  const all = calls.map((c) => c.args.join(' ')).join('\n');
  for (const banned of ['APPROVE', 'REQUEST_CHANGES', '$event', 'pr review', 'pr comment'])
    expect(all).not.toContain(banned);
});

test('with no pending review, publish submits nothing and reports 0', async () => {
  const { run, calls } = fakeGh(false);
  expect(await githubApi.publish(run, REPO, 214)).toEqual({ ok: true, value: { published: 0 } });
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args[3]).not.toContain('mutation');
});

test('a failed submit is reported, not thrown', async () => {
  const { run } = fakeGh(true, 'fails');
  expect(await githubApi.publish(run, REPO, 214)).toEqual({
    ok: false,
    reason: 'failed',
    detail: 'exit 1',
  });
});
