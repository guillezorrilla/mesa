import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { githubApi } from './github.js';

// An invented PR's patch, as `gh pr diff` prints it.
const PATCH = `diff --git a/src/edge/cache.ts b/src/edge/cache.ts
index 1a2b3c4..5d6e7f8 100644
--- a/src/edge/cache.ts
+++ b/src/edge/cache.ts
@@ -1,2 +1,2 @@
 const ttl = 60;
-const key = item.id;
+const key = \`\${item.id}:\${width}\`;
`;

test('diff reads the PR patch through gh pr diff, uncoloured, the number after --', async () => {
  const { run, calls } = scriptedRunner({ gh: PATCH });
  expect(await githubApi.diff(run, 'acme/storefront', 477)).toEqual({ ok: true, value: PATCH });
  expect(calls.map((c) => [c.file, ...c.args])).toEqual([
    ['gh', 'pr', 'diff', '--repo', 'acme/storefront', '--color', 'never', '--', '477'],
  ]);
});

test('a failing or slow gh pr diff is reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['gh'] });
  expect(await githubApi.diff(failing.run, 'acme/storefront', 477)).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const slow = scriptedRunner({}, { slow: ['gh'] });
  expect(await githubApi.diff(slow.run, 'acme/storefront', 477)).toMatchObject({
    ok: false,
    reason: 'timeout',
  });
});
