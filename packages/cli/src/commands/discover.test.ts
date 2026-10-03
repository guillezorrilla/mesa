import { utimesSync } from 'node:fs';
import { join } from 'node:path';
import { codexWorld, plantTranscript } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

const CLAUDE_ID = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const CODEX_ID = '01a0e14e-be41-72f1-a81b-e25d2198602a';
const LIVE_ID = '01a0e14e-be41-72f1-a81b-e25d2198602b';

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
