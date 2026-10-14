import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { bitbucketApi } from './bitbucket.js';

const REPO = 'acme-eng/atlas-api';
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];
// An invented PR's patch, wrapped as `twg bitbucket pull-requests diff --output json` prints it.
const PATCH = `diff --git a/api/routes.py b/api/routes.py
--- a/api/routes.py
+++ b/api/routes.py
@@ -4 +4 @@
-TIMEOUT = 5
+TIMEOUT = 10
`;

test('diff reads the PR patch through twg bitbucket pull-requests diff', async () => {
  const { run, calls } = scriptedRunner({
    twg: JSON.stringify({ pullRequest: 214, kind: 'diff', content: PATCH }),
  });
  expect(await bitbucketApi.diff(run, REPO, 214)).toEqual({ ok: true, value: PATCH });
  expect(calls.map((c) => c.args)).toEqual([
    ['bitbucket', 'pull-requests', 'diff', '214', '--repo', REPO, ...JSON_OUT],
  ]);
});

test('a failing twg or an answer with no patch is reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['twg'] });
  expect(await bitbucketApi.diff(failing.run, REPO, 214)).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const odd = scriptedRunner({ twg: '{"pullRequest":214}' });
  expect(await bitbucketApi.diff(odd.run, REPO, 214)).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
