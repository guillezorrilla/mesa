import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import type { RunResult } from '../lib/process.js';
import { scriptedRunner } from '../testing/runner.js';
import { bitbucketApi } from './bitbucket.js';

// An invented PR, in the shapes `twg ... --output json` prints them. My pending drafts on it:
// 705 (a reply to the posted thread 701), 708 (inline) and 709 (the summary); 710 is someone
// else's pending comment and 711 a deleted one of mine.
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/bitbucket/${name}.json`, import.meta.url), 'utf8');
const WHOAMI = fixture('whoami');
const PR = JSON.parse(fixture('pr'));
const ME = JSON.parse(WHOAMI).data.accountId;
const JSON_OUT = ['--output', 'json', '--output-summary', 'none'];
const REPO = 'acme-eng/atlas-api';
const COMMENT = ['bitbucket', 'pull-requests', 'comment'];
const FORBIDDEN = /approve|request-changes|merge|decline|submit|--pending/;

/** The fixture PR with a pending reply of mine to my pending draft 708, listed before it. */
const withReplyToDraft = () => {
  const [reply] = PR._comments.filter((c: { id: number }) => c.id === 705);
  return JSON.stringify({
    ...PR,
    _comments: [
      { ...reply, id: 712, content: { raw: 'Or wrap it in a finally.' }, parent: { id: 708 } },
      ...PR._comments,
    ],
  });
};

/**
 * A twg for the fixture PR: comment create answers with a new id from 900 up, anchored as asked,
 * and delete with what it removed. `fail` makes that subcommand exit non-zero.
 */
function fakeTwg(pr: string, fail?: 'create' | 'delete') {
  let next = 900;
  const flag = (args: string[], name: string) =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
  return scriptedRunner({
    twg: (args): string | RunResult => {
      if (args[0] === 'whoami') return WHOAMI;
      if (args[2] === 'get') return pr;
      if (args[3] === fail) return { ok: false, reason: 'failed', detail: 'exit 1' };
      if (args[3] === 'delete') return JSON.stringify({ deleted: true });
      const path = flag(args, 'path');
      const parent = flag(args, 'reply-to');
      return JSON.stringify({
        id: next++,
        content: { raw: flag(args, 'text') },
        ...(path ? { inline: { path, to: Number(flag(args, 'line')) } } : {}),
        ...(parent ? { parent: { id: Number(parent) } } : {}),
      });
    },
  });
}

const reads = [
  ['whoami', ...JSON_OUT],
  ['bitbucket', 'pull-requests', 'get', '214', '--comments', '--repo', REPO, ...JSON_OUT],
];
const create = (...rest: string[]) => [
  ...COMMENT,
  'create',
  '--pull-request=214',
  `--repo=${REPO}`,
  ...rest,
  ...JSON_OUT,
];
const remove = (id: number) => [
  ...COMMENT,
  'delete',
  '--pull-request=214',
  `--comment=${id}`,
  `--repo=${REPO}`,
  '--yes',
  ...JSON_OUT,
];

test('publish posts each pending draft without --pending, then deletes its pending copy', async () => {
  const { run, calls } = fakeTwg(withReplyToDraft());
  const done = await bitbucketApi.publish(run, REPO, 214);
  expect(done).toEqual({ ok: true, value: { published: 4 } });
  expect(calls.map((c) => c.args)).toEqual([
    ...reads,
    // The summary, the inline draft, then replies: one to a pending draft after its parent.
    create('--text=Nice change overall.'),
    remove(709),
    create('--text=Close the stream on error too.', '--path=src/export/stream.ts', '--line=30'),
    remove(708),
    create('--text=Thanks, looks right.', '--reply-to=701'),
    remove(705),
    // 712 answered the pending 708, now posted as 901.
    create('--text=Or wrap it in a finally.', '--reply-to=901'),
    remove(712),
  ]);
  for (const c of calls) expect(c.args.join(' ')).not.toMatch(FORBIDDEN);
  // Only my own pending drafts are touched: not someone else's, not a deleted one.
  for (const id of [710, 711])
    expect(calls.flatMap((c) => c.args)).not.toContain(`--comment=${id}`);
});

test('with nothing pending of mine, publish writes nothing and reports 0', async () => {
  const none = JSON.stringify({
    ...PR,
    _comments: PR._comments.filter(
      (c: { user: { account_id?: string } }) => c.user.account_id !== ME,
    ),
  });
  const { run, calls } = fakeTwg(none);
  expect(await bitbucketApi.publish(run, REPO, 214)).toEqual({ ok: true, value: { published: 0 } });
  expect(calls.map((c) => c.args)).toEqual(reads);
});

test('a failed post stops publishing and is reported with how far it got', async () => {
  const { run, calls } = fakeTwg(JSON.stringify(PR), 'create');
  const done = await bitbucketApi.publish(run, REPO, 214);
  expect(done).toEqual({
    ok: false,
    reason: 'failed',
    detail: '0 of 3 drafts posted; posting draft 709 failed: exit 1',
  });
  // Its pending copy is kept, so the draft is not lost.
  expect(calls.some((c) => c.args[3] === 'delete')).toBe(false);
});

test('a failed delete after a post is reported, counting the posted draft', async () => {
  const { run } = fakeTwg(JSON.stringify(PR), 'delete');
  expect(await bitbucketApi.publish(run, REPO, 214)).toEqual({
    ok: false,
    reason: 'failed',
    detail: '1 of 3 drafts posted; deleting the pending copy of 709 failed: exit 1',
  });
});
