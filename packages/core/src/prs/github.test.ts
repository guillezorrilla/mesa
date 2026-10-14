import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { readGithub } from './github.js';

// An invented repo's open PRs, in the shape `gh api graphql` prints them.
const FIXTURE = readFileSync(new URL('./fixtures/github/open-prs.json', import.meta.url), 'utf8');

test('reads open PRs through one gh api graphql call, as facts for the bucket rule', async () => {
  const { run, calls } = scriptedRunner({ gh: FIXTURE });
  const read = await readGithub(run, 'acme/storefront');
  expect(calls).toHaveLength(1);
  expect(calls[0]?.args.slice(0, 2)).toEqual(['api', 'graphql']);
  expect(calls[0]?.args).toEqual(expect.arrayContaining(['owner=acme', 'name=storefront']));
  if (!read.ok) throw new Error(read.reason);
  expect(read.me).toBe('ana-r');
  expect(read.prs.map((p) => [p.number, p.author])).toEqual([
    [482, 'dana-ruiz'],
    [477, 'lee-park'],
    [470, 'ghost'],
    [468, 'ana-r'],
  ]);
  expect(read.prs[0]).toMatchObject({ requested: true, branch: 'feat/checkout-totals' });
  expect(read.prs[1]).toMatchObject({
    requested: false,
    // The pending review is my unsent draft, not a review.
    reviews: [{ author: 'ana-r', state: 'changes', at: '2026-10-12T15:00:00Z' }],
    threads: [
      { author: 'ana-r', resolved: true },
      { author: 'ana-r', resolved: false },
    ],
  });
  expect(read.prs[1]?.comments).toHaveLength(4);
});

test('a failing gh and an unexpected shape are reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['gh'] });
  expect(await readGithub(failing.run, 'acme/storefront')).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const odd = scriptedRunner({ gh: '{"data":{}}' });
  expect(await readGithub(odd.run, 'acme/storefront')).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
