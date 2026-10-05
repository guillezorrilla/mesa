import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_VERSION,
  codexWorld,
  countReads,
  datedTranscript,
  plantTranscript,
  scriptedRunner,
} from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const CLAUDE_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const CODEX_ID = '01a0e14e-be41-72f1-a81b-e25d2198602a';
const LIVE_ID = '01a0e14e-be41-72f1-a81b-e25d2198602b';
const OTHER_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e70';
const WORKTREE_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e71';

test('discover --json prints the scan; text has one line per project folder', async () => {
  const dir = await cli.withProject();
  const codex = codexWorld();
  cli.env = codex.env;
  const title = { type: 'custom-title', customTitle: 'Tide tables' };
  const file = plantTranscript(
    cli.home,
    CLAUDE_ID,
    dir,
    [{ type: 'user', cwd: dir }, title].map((l) => JSON.stringify(l)).join('\n'),
  );
  // The fixed clock is 2026-09-24T12:00:00.000Z.
  utimesSync(file, new Date('2026-09-23T10:00:00.000Z'), new Date('2026-09-23T10:00:00.000Z'));
  codex.rollout({
    id: CODEX_ID,
    cwd: join(cli.home, 'scratch'),
    startedAt: '2026-09-22T11:58:00.000Z',
  });
  // Written in the last 10 minutes: Codex's listing has it running.
  codex.rollout({ id: LIVE_ID, cwd: dir, startedAt: '2026-09-24T11:55:00.000Z' });
  codex.name(LIVE_ID, 'Lantern lights');

  const { json } = await cli.mesa('discover', '--json');
  expect(json).toMatchObject({
    ok: true,
    data: {
      since: '2026-08-25T12:00:00.000Z',
      days: 30,
      projects: [{ path: dir, name: 'lantern-cove', registered: true, conversations: 1, live: 1 }],
      live: [{ agent: 'codex', id: LIVE_ID, cwd: dir, project: dir, name: 'Lantern lights' }],
      conversations: [
        { agent: 'claude', id: CLAUDE_ID, project: dir, name: 'Tide tables' },
        { agent: 'codex', id: CODEX_ID, project: null },
      ],
      total: 2,
      truncated: false,
      unsupported: [{ agent: 'antigravity', reason: expect.any(String) }],
    },
  });

  const { stdout, code } = await cli.mesa('discover', '--days', '7');
  expect(code).toBe(0);
  expect(stdout).toBe(
    [
      `lantern-cove  ${dir}  1 conversation, 1 running  (registered)`,
      `running  Lantern lights  codex  ${dir}`,
      '1 conversation in no project folder',
      '',
    ].join('\n'),
  );
});

test('--days outside 1 to 365 is a usage error; an empty machine finds nothing and exits 0', async () => {
  await cli.withProject();
  for (const days of ['0', '366', 'week']) {
    const { json, code } = await cli.mesa('discover', '--days', days, '--json');
    expect(code).not.toBe(0);
    expect(json).toMatchObject({ ok: false, error: { code: 'usage' } });
  }
  const { stdout, code } = await cli.mesa('discover');
  expect(code).toBe(0);
  expect(stdout).toBe('nothing found in the last 30 days\n');
});

test('conversations in no project folder are counted on their own line', async () => {
  await cli.withProject();
  const loose = join(cli.home, 'scratch');
  const file = plantTranscript(
    cli.home,
    CLAUDE_ID,
    loose,
    JSON.stringify({ type: 'user', cwd: loose }),
  );
  utimesSync(file, new Date('2026-09-23T10:00:00.000Z'), new Date('2026-09-23T10:00:00.000Z'));
  const { stdout, code } = await cli.mesa('discover');
  expect(code).toBe(0);
  expect(stdout).toBe('1 conversation in no project folder\n');
});

/** tide-pool, an unregistered repository below the home, with two recent conversations. */
function tidePool() {
  const tide = join(cli.home, 'src/tide-pool');
  mkdirSync(join(tide, '.git'), { recursive: true });
  const title = { type: 'custom-title', customTitle: 'Tide tables' };
  datedTranscript(cli.home, CLAUDE_ID, tide, '2026-09-23T10:00:00.000Z', title);
  datedTranscript(cli.home, OTHER_ID, tide, '2026-09-22T10:00:00.000Z');
  return tide;
}

test('discover adopt --json registers the folder and adopts its conversations; a second run adopts none', async () => {
  await cli.withProject();
  const tide = tidePool();
  const { json } = await cli.mesa('discover', 'adopt', tide, '--json');
  expect(json).toMatchObject({
    ok: true,
    data: {
      project: 'tide-pool',
      registered: true,
      adopted: [
        { id: expect.any(String), agentSessionId: CLAUDE_ID, agent: 'claude', name: 'Tide tables' },
        { id: expect.any(String), agentSessionId: OTHER_ID, agent: 'claude' },
      ],
      reopened: [],
      failed: [],
      receipt: null,
    },
  });
  const { stdout, code } = await cli.mesa('discover', 'adopt', tide, '--days', '7');
  expect(code).toBe(0);
  expect(stdout).toBe('tide-pool: 0 sessions adopted\n');
});

test('discover adopt text says registered, the counts, and a conversation adopted into another project', async () => {
  await cli.withProject();
  const tide = tidePool();
  // A linked worktree of tide-pool registered as its own project: its conversation goes there.
  const worktree = join(cli.home, 'wt/tide-pool-fix');
  mkdirSync(join(tide, '.git/worktrees/tide-pool-fix'), { recursive: true });
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, '.git'), `gitdir: ${tide}/.git/worktrees/tide-pool-fix\n`);
  await cli.mesa('register', '--create', worktree);
  datedTranscript(cli.home, WORKTREE_ID, worktree, '2026-09-21T10:00:00.000Z');
  const { stdout, code } = await cli.mesa('discover', 'adopt', tide);
  expect(code).toBe(0);
  expect(stdout.split('\n')).toEqual([
    'tide-pool: registered, 3 sessions adopted',
    `adopted ${WORKTREE_ID} into tide-pool-fix`,
    '',
  ]);
});

test('discover adopt exits 2 and prints every item when one adoption failed', async () => {
  await cli.withProject();
  const tide = tidePool();
  const codex = codexWorld();
  cli.env = codex.env;
  // Written in the last 10 minutes: Codex's listing has it running; codex itself is missing.
  codex.rollout({ id: LIVE_ID, cwd: tide, startedAt: '2026-09-24T11:55:00.000Z' });
  cli.run = scriptedRunner(
    { tmux: 'tmux 3.7c', claude: CLAUDE_VERSION },
    { missing: ['codex'] },
  ).run;
  const { json, code } = await cli.mesa('discover', 'adopt', tide, '--live', '--json');
  expect(code).toBe(2);
  expect(json).toMatchObject({
    ok: true,
    data: {
      project: 'tide-pool',
      adopted: [{ agentSessionId: CLAUDE_ID }, { agentSessionId: OTHER_ID }],
      reopened: [],
      failed: [{ agentSessionId: LIVE_ID, reason: expect.any(String) }],
    },
  });
});

test('discover adopt of a path that is not a folder is not_found', async () => {
  await cli.withProject();
  const { json, code } = await cli.mesa('discover', 'adopt', join(cli.home, 'nowhere'), '--json');
  expect(code).toBe(3);
  expect(json).toMatchObject({ ok: false, error: { code: 'not_found' } });
});

test('discover adopt with two paths prints both items and scans once', async () => {
  const dir = await cli.withProject();
  const tide = tidePool();
  const harbor = join(cli.home, 'src/harbor');
  mkdirSync(join(harbor, '.git'), { recursive: true });
  datedTranscript(cli.home, WORKTREE_ID, harbor, '2026-09-21T10:00:00.000Z');
  // In lantern-cove, not adopted: its head is read by the one scan only.
  const kept = datedTranscript(cli.home, LIVE_ID, dir, '2026-09-21T10:00:00.000Z');
  const reads = countReads();
  let out: Awaited<ReturnType<typeof cli.mesa>>;
  try {
    out = await cli.mesa('discover', 'adopt', tide, harbor);
  } finally {
    reads.restore();
  }
  expect(out.code).toBe(0);
  expect(out.stdout).toBe(
    'tide-pool: registered, 2 sessions adopted\nharbor: registered, 1 session adopted\n',
  );
  expect(reads.opened.filter((f) => f === kept)).toHaveLength(1);

  const { json, code } = await cli.mesa('discover', 'adopt', tide, harbor, '--json');
  expect(code).toBe(0);
  expect(json).toMatchObject({
    ok: true,
    data: {
      items: [
        { project: 'tide-pool', registered: false, adopted: [] },
        { project: 'harbor', registered: false, adopted: [] },
      ],
    },
  });
});

test('discover adopt --ids adopts exactly those, exits 2 for one it cannot, and takes one path', async () => {
  await cli.withProject();
  const tide = tidePool();
  const { json, code } = await cli.mesa(
    'discover',
    'adopt',
    tide,
    '--ids',
    `${CLAUDE_ID},${LIVE_ID}`,
    '--json',
  );
  expect(code).toBe(2);
  expect(json).toMatchObject({
    ok: true,
    data: {
      project: 'tide-pool',
      adopted: [{ agentSessionId: CLAUDE_ID, name: 'Tide tables' }],
      failed: [{ agentSessionId: LIVE_ID, reason: expect.stringContaining('not a Claude Code') }],
    },
  });
  // None given: nothing adopted, and no scan finds OTHER_ID.
  const none = await cli.mesa('discover', 'adopt', tide, '--ids', '', '--json');
  expect(none.code).toBe(0);
  expect(none.json).toMatchObject({ ok: true, data: { adopted: [], failed: [] } });
  const both = await cli.mesa('discover', 'adopt', tide, tide, '--ids', OTHER_ID, '--json');
  expect(both.code).toBe(2);
  expect(both.json).toMatchObject({ ok: false, error: { code: 'usage' } });
  // --ids scans nothing, so a window of days means nothing with it.
  const days = await cli.mesa(
    'discover',
    'adopt',
    tide,
    '--days',
    '0',
    '--ids',
    OTHER_ID,
    '--json',
  );
  expect(days.code).toBe(2);
  expect(days.json).toMatchObject({
    ok: false,
    error: {
      code: 'usage',
      message: '--ids adopts those conversations without a scan: drop --days',
    },
  });
});
