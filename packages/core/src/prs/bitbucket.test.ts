import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { readBitbucket } from './bitbucket.js';
import { bucketOf } from './buckets.js';

// An invented workspace's open PRs, in the shapes `twg ... --output json` prints them.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/bitbucket/${name}.json`, import.meta.url), 'utf8');
const WHOAMI = fixture('whoami');
const OPEN = fixture('open-prs');
const DETAILS = fixture('prs');

const KOFI = '5f1a2b3c4d5e6f7a8b9c0d1e';
const LENA = '6a0b1c2d3e4f5a6b7c8d9e0f';
const AMARA = '712020:3c9e4f10-2b6d-4e8a-9f1c-7d5e8a2b4c61';
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];

/** Answers twg by subcommand: whoami, the open PR query, and PR details. */
const twg = (details: (args: string[]) => string, open = OPEN) =>
  scriptedRunner({
    twg: (args) =>
      args[0] === 'whoami' ? WHOAMI : args[2] === 'query' ? open : details(args.slice(3)),
  });

test('reads open PRs through whoami, one query and one batched get, people by account id', async () => {
  const { run, calls } = twg(() => DETAILS);
  const read = await readBitbucket(run, 'acme-eng/atlas-api');
  expect(calls.map((c) => c.args)).toEqual([
    ['whoami', ...JSON_OUT],
    [
      'bitbucket',
      'pull-requests',
      'query',
      '--repo',
      'acme-eng/atlas-api',
      '--state',
      'OPEN',
      '--limit',
      '50',
      ...JSON_OUT,
    ],
    [
      'bitbucket',
      'pull-requests',
      'get',
      '212',
      '208',
      '205',
      '--comments',
      '--repo',
      'acme-eng/atlas-api',
      ...JSON_OUT,
    ],
  ]);
  if (!read.ok) throw new Error(read.reason);
  expect(read.me).toBe(KOFI);
  expect(read.prs.map((p) => [p.number, p.author, bucketOf(p, read.me).bucket])).toEqual([
    [212, AMARA, 'need'],
    [208, LENA, 'updated'],
    [205, KOFI, 'other'],
  ]);
});

test('a PR asking for my review, with nobody having reviewed it yet', async () => {
  const read = await readBitbucket(twg(() => DETAILS).run, 'acme-eng/atlas-api');
  if (!read.ok) throw new Error(read.reason);
  expect(read.prs[0]).toEqual({
    number: 212,
    title: 'Rate limit the export endpoint',
    url: 'https://bitbucket.org/acme-eng/atlas-api/pull-requests/212',
    branch: 'feat/export-rate-limit',
    updatedAt: '2026-10-13T09:00:00.000000+00:00',
    author: AMARA,
    authorName: 'Amara Osei',
    state: 'open',
    requested: true,
    reviews: [],
    comments: [],
    commits: ['2026-10-13T08:05:00+00:00'],
    threads: [],
  });
});

test('a PR I asked changes on, with later commits, author replies and my two threads', async () => {
  const read = await readBitbucket(twg(() => DETAILS).run, 'acme-eng/atlas-api');
  if (!read.ok) throw new Error(read.reason);
  const pr = read.prs[1];
  if (!pr) throw new Error('missing PR 208');
  expect(pr).toMatchObject({
    requested: true,
    // Amara only commented (and deleted it): a participant, not a review.
    reviews: [{ author: KOFI, state: 'changes', at: '2026-10-10T14:05:00.000000+00:00' }],
    // My pending draft and the deleted comment are left out; the inline reply counts.
    comments: [
      { author: KOFI, at: '2026-10-10T14:00:00.000000+00:00' },
      { author: LENA, at: '2026-10-11T09:00:00.000000+00:00' },
      { author: KOFI, at: '2026-10-10T14:02:00.000000+00:00' },
      { author: LENA, at: '2026-10-11T09:30:00.000000+00:00' },
    ],
    threads: [
      { author: KOFI, resolved: true },
      { author: KOFI, resolved: false },
    ],
  });
  expect(bucketOf(pr, KOFI)).toEqual({
    bucket: 'updated',
    since: { commits: 1, replies: 2, resolved: 1, threads: 2 },
  });
  expect(read.prs[2]?.reviews).toEqual([
    { author: AMARA, state: 'approved', at: '2026-10-10T16:00:00.000000+00:00' },
  ]);
});

test('one PR comes back unwrapped, and more than 25 are fetched in batches of 25', async () => {
  const pr = JSON.parse(DETAILS).items[0].data;
  const single = await readBitbucket(
    twg(() => JSON.stringify(pr), JSON.stringify([{ id: 212 }])).run,
    'acme-eng/atlas-api',
  );
  expect(single).toMatchObject({ ok: true, prs: [{ number: 212, requested: true }] });

  const ids = Array.from({ length: 27 }, (_, i) => i + 1);
  const { run, calls } = twg(
    (args) =>
      JSON.stringify({
        items: args
          .filter((a) => /^\d+$/.test(a))
          .map((id) => ({ input: id, ok: true, data: { ...pr, id: Number(id) } })),
      }),
    JSON.stringify(ids.map((id) => ({ id }))),
  );
  const many = await readBitbucket(run, 'acme-eng/atlas-api');
  const numbers = (args: string[]) => args.filter((a) => /^\d+$/.test(a)).length;
  expect(calls.filter((c) => c.args[2] === 'get').map((c) => numbers(c.args))).toEqual([25, 2]);
  expect(many.ok && many.prs.map((p) => p.number)).toEqual(ids);
});

test('a failing or slow twg and unexpected output are reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['twg'] });
  expect(await readBitbucket(failing.run, 'acme-eng/atlas-api')).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const slow = scriptedRunner({}, { slow: ['twg'] });
  expect(await readBitbucket(slow.run, 'acme-eng/atlas-api')).toMatchObject({
    ok: false,
    reason: 'timeout',
  });
  const notJson = twg(() => 'output_files:\n  stdout: /tmp/x.json\n---END---');
  expect(await readBitbucket(notJson.run, 'acme-eng/atlas-api')).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
  const odd = twg(() => '{"items":[{"input":"212","ok":false}]}');
  expect(await readBitbucket(odd.run, 'acme-eng/atlas-api')).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
