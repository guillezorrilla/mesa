import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { bitbucketApi } from './bitbucket.js';

// An invented PR's detail, in the shapes `twg ... --output json` prints them.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/bitbucket/${name}.json`, import.meta.url), 'utf8');
const WHOAMI = fixture('whoami');
const PR = fixture('pr');
const DIFFSTAT = fixture('diffstat');

const KOFI = '5f1a2b3c4d5e6f7a8b9c0d1e';
const LENA = '6a0b1c2d3e4f5a6b7c8d9e0f';
const AMARA = '712020:3c9e4f10-2b6d-4e8a-9f1c-7d5e8a2b4c61';
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];
const REPO = 'acme-eng/atlas-api';

/** Answers twg by subcommand: whoami, the PR with its comments, and its diffstat. */
const twg = (pr = PR) =>
  scriptedRunner({
    twg: (args) => (args[0] === 'whoami' ? WHOAMI : args[2] === 'get' ? pr : DIFFSTAT),
  });

/** The fixture PR with its build statuses replaced. */
const withStatuses = (...states: string[]) =>
  JSON.stringify({ ...JSON.parse(PR), _statuses: states.map((state) => ({ state })) });

test('show reads whoami, the PR with comments and its diffstat', async () => {
  const { run, calls } = twg();
  const read = await bitbucketApi.show(run, REPO, 214);
  expect(calls.map((c) => c.args)).toEqual([
    ['whoami', ...JSON_OUT],
    ['bitbucket', 'pull-requests', 'get', '214', '--comments', '--repo', REPO, ...JSON_OUT],
    ['bitbucket', 'pull-requests', 'diffstat', '214', '--repo', REPO, ...JSON_OUT],
  ]);
  if (!read.ok) throw new Error(read.reason);
  expect(read.value).toMatchObject({
    me: KOFI,
    base: 'main',
    additions: 65,
    deletions: 21,
    checks: 'pending',
    pr: { number: 214, author: AMARA, authorName: 'Amara Osei', requested: true, state: 'open' },
  });
});

test('threads are top-level inline comments with their newest posted reply, by name', async () => {
  const read = await bitbucketApi.show(twg().run, REPO, 214);
  if (!read.ok) throw new Error(read.reason);
  expect(read.value.threads).toEqual([
    {
      id: '701',
      author: KOFI,
      path: 'src/export/stream.ts',
      line: 18,
      body: 'Should the chunk size come from config?',
      resolved: true,
      // A reply to a reply still belongs to 701; the later deleted and pending ones are skipped.
      lastReply: { author: 'Amara Osei', body: 'Done, it reads EXPORT_CHUNK_ROWS now.' },
    },
    {
      id: '706',
      author: LENA,
      path: 'src/export/route.ts',
      line: null,
      body: 'Why drop the old CSV header here?',
      resolved: false,
    },
  ]);
});

test('drafts are only my pending, undeleted comments: inline, reply and summary', async () => {
  const read = await bitbucketApi.show(twg().run, REPO, 214);
  if (!read.ok) throw new Error(read.reason);
  expect(read.value.drafts).toEqual([
    {
      id: '705',
      path: 'src/export/stream.ts',
      line: 18,
      body: 'Thanks, looks right.',
      replyTo: '701',
    },
    { id: '708', path: 'src/export/stream.ts', line: 30, body: 'Close the stream on error too.' },
    { id: '709', path: null, line: null, body: 'Nice change overall.' },
  ]);
});

test('files come from the diffstat, an added or removed file by the path it has', async () => {
  const read = await bitbucketApi.show(twg().run, REPO, 214);
  if (!read.ok) throw new Error(read.reason);
  expect(read.value.files).toEqual([
    { path: 'src/export/stream.ts', additions: 40, deletions: 12 },
    { path: 'src/export/chunk.ts', additions: 25, deletions: 0 },
    { path: 'src/export/buffer.ts', additions: 0, deletions: 9 },
  ]);
});

test('checks roll up the head commit statuses', async () => {
  const checks = async (...states: string[]) => {
    const read = await bitbucketApi.show(twg(withStatuses(...states)).run, REPO, 214);
    return read.ok ? read.value.checks : read.reason;
  };
  expect(await checks()).toBeNull();
  expect(await checks('SUCCESSFUL', 'SUCCESSFUL')).toBe('passing');
  expect(await checks('SUCCESSFUL', 'INPROGRESS')).toBe('pending');
  expect(await checks('INPROGRESS', 'FAILED')).toBe('failing');
  expect(await checks('SUCCESSFUL', 'STOPPED')).toBe('failing');
});

test('a failing or slow twg and unexpected output are reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['twg'] });
  expect(await bitbucketApi.show(failing.run, REPO, 214)).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const slow = scriptedRunner({}, { slow: ['twg'] });
  expect(await bitbucketApi.show(slow.run, REPO, 214)).toMatchObject({
    ok: false,
    reason: 'timeout',
  });
  expect(await bitbucketApi.show(twg('{"id":214}').run, REPO, 214)).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
