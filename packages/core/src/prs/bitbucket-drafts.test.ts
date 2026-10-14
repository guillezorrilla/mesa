import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { scriptedRunner } from '../testing/runner.js';
import { bitbucketApi } from './bitbucket.js';

// What `twg ... comment create --pending --output json` prints: the new comment, invented here.
const CREATED = readFileSync(
  new URL('./fixtures/bitbucket/comment-created.json', import.meta.url),
  'utf8',
);
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];
const REPO = 'acme-eng/atlas-api';
const CREATE = ['bitbucket', 'pull-requests', 'comment', 'create', '--pull-request=214'];
const FORBIDDEN = /approve|request-changes|merge|decline|submit/;

/** Every call left `--pending` and none approves, merges or declines. */
const onlyPending = (calls: { args: string[] }[]) => {
  for (const c of calls) {
    expect(c.args).toContain('--pending');
    expect(c.args.join(' ')).not.toMatch(FORBIDDEN);
  }
};

test('an inline draft is a pending comment on the path and line', async () => {
  const { run, calls } = scriptedRunner({ twg: CREATED });
  const made = await bitbucketApi.draft(run, REPO, 214, {
    text: 'Close the stream on error too.',
    path: 'src/export/stream.ts',
    line: 30,
  });
  expect(calls.map((c) => c.args)).toEqual([
    [
      ...CREATE,
      `--repo=${REPO}`,
      '--text=Close the stream on error too.',
      '--pending',
      '--path=src/export/stream.ts',
      '--line=30',
      ...JSON_OUT,
    ],
  ]);
  onlyPending(calls);
  expect(made).toEqual({
    ok: true,
    value: {
      id: '720',
      path: 'src/export/stream.ts',
      line: 30,
      body: 'Close the stream on error too.',
    },
  });
});

test('a reply answers its thread and a summary has no anchor, both pending', async () => {
  const reply = scriptedRunner({
    twg: JSON.stringify({ ...JSON.parse(CREATED), parent: { id: 701 } }),
  });
  const answered = await bitbucketApi.draft(reply.run, REPO, 214, {
    text: '-1 on this, see above.',
    replyTo: '701',
  });
  expect(reply.calls[0]?.args).toEqual([
    ...CREATE,
    `--repo=${REPO}`,
    '--text=-1 on this, see above.',
    '--pending',
    '--reply-to=701',
    ...JSON_OUT,
  ]);
  expect(answered).toMatchObject({ ok: true, value: { id: '720', replyTo: '701' } });

  const { inline: _, ...summaryComment } = JSON.parse(CREATED);
  const summary = scriptedRunner({ twg: JSON.stringify(summaryComment) });
  const left = await bitbucketApi.draft(summary.run, REPO, 214, { text: 'Nice change overall.' });
  expect(summary.calls[0]?.args).toEqual([
    ...CREATE,
    `--repo=${REPO}`,
    '--text=Nice change overall.',
    '--pending',
    ...JSON_OUT,
  ]);
  expect(left).toMatchObject({ ok: true, value: { path: null, line: null } });
  onlyPending([...reply.calls, ...summary.calls]);
});

test('discard deletes a comment only after reading it as still pending', async () => {
  const { run, calls } = scriptedRunner({
    twg: (args) =>
      args[3] === 'get'
        ? JSON.stringify({ id: 708, pending: true })
        : JSON.stringify({ deleted: true, id: '708' }),
  });
  expect(await bitbucketApi.discard(run, REPO, 214, '708')).toEqual({
    ok: true,
    value: { id: '708' },
  });
  expect(calls.map((c) => c.args)).toEqual([
    [
      'bitbucket',
      'pull-requests',
      'comment',
      'get',
      '214',
      '--comment=708',
      `--repo=${REPO}`,
      ...JSON_OUT,
    ],
    [
      'bitbucket',
      'pull-requests',
      'comment',
      'delete',
      '--pull-request=214',
      '--comment=708',
      `--repo=${REPO}`,
      '--yes',
      ...JSON_OUT,
    ],
  ]);
});

test('a posted comment is never discarded', async () => {
  const { run, calls } = scriptedRunner({ twg: JSON.stringify({ id: 701, pending: false }) });
  expect(await bitbucketApi.discard(run, REPO, 214, '701')).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  expect(calls.map((c) => c.args[3])).toEqual(['get']);
});

test('failures and unexpected answers are reported, never thrown', async () => {
  const failing = scriptedRunner({}, { failing: ['twg'] });
  expect(await bitbucketApi.draft(failing.run, REPO, 214, { text: 'x' })).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  expect(await bitbucketApi.discard(failing.run, REPO, 214, '708')).toMatchObject({
    ok: false,
    reason: 'failed',
  });
  const slow = scriptedRunner({}, { slow: ['twg'] });
  expect(await bitbucketApi.draft(slow.run, REPO, 214, { text: 'x' })).toMatchObject({
    ok: false,
    reason: 'timeout',
  });
  const odd = scriptedRunner({ twg: '{"ok":false}' });
  expect(await bitbucketApi.draft(odd.run, REPO, 214, { text: 'x' })).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
  expect(await bitbucketApi.discard(odd.run, REPO, 214, '708')).toEqual({
    ok: false,
    reason: 'invalid-data',
  });
});
