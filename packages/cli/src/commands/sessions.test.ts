import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newSession, scriptedRunner, tmuxLine } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('sessions lists the records with live tmux; a fresh profile is empty', async () => {
  await mesa('init', '--vault', 'vault');
  expect((await mesa('sessions', '--json')).json).toEqual({ ok: true, data: [] });
  expect((await mesa('sessions')).stdout).toBe('no sessions; run mesa open <project>\n');

  const record = (id: string, project: string, startedAt: string, extra = {}) => ({
    id,
    ...newSession({ project, startedAt, ...extra }),
    tmux: { socket: 'mesa-default', session: project, window: `claude-${id.slice(0, 6)}` },
    events: [],
  });
  const dir = join(cli.home, '.mesa/default/sessions');
  const save = (r: { id: string }) => writeFileSync(join(dir, `${r.id}.json`), JSON.stringify(r));
  save(record('aaaaaaaa', 'lantern-cove', '2026-09-24T11:00:00.000Z'));
  save(
    // Stopped two days ago: off the board, but shown with --all.
    record('bbbbbbbb', 'tide', '2026-09-22T10:00:00.000Z', { endedAt: '2026-09-22T10:10:00.000Z' }),
  );
  const worktree = { path: '/h/.mesa/default/worktrees/harbor/try-x', branch: 'try/x' };
  save(record('cccccccc', 'harbor', '2026-09-24T11:59:18.000Z', { worktree }));
  // tmux still has lantern-cove's window, showing a finished reply; harbor's is gone.
  const screen = ['⏺ Wrote tide-tables.md', '', '─────', '❯', '─────'].join('\n');
  cli.run = scriptedRunner({
    tmux: (args) =>
      args.includes('capture-pane')
        ? screen
        : `${tmuxLine({ project: 'lantern-cove', window: 'claude-aaaaaa' })}\n`,
  }).run;

  const { json } = await mesa('sessions', '--json');
  expect(json.data.map((s: { id: string; alive: boolean }) => [s.id, s.alive])).toEqual([
    ['aaaaaaaa', true],
    ['cccccccc', false],
  ]);
  expect(json.data[1].lastState).toMatchObject({ state: 'done', source: 'tmux' });
  expect((await mesa('sessions', '--all')).stdout).toBe(
    [
      // By attention: the live one (its screen reads idle, 60%), the vanished one, the stopped one.
      // A session in its own worktree shows its branch.
      'aaaaaaaa  lantern-cove    claude  idle     60%  0.33  ctx -  1h00m   ⏺ Wrote tide-tables.md',
      'cccccccc  harbor (try/x)  claude  done     85%  0.25  ctx -  42s',
      'bbbbbbbb  tide            claude  working  95%  0.00  ctx -  10m00s',
      '',
    ].join('\n'),
  );
});

test('sessions shows agent sessions Mesa did not start; stop, send, resume refuse them', async () => {
  await cli.withProject({ layOut: false });
  // A claude started in a plain terminal in the project, as `claude agents --json` lists it.
  const listing = [
    {
      pid: 4242,
      cwd: join(cli.home, 'src/lantern-cove'),
      kind: 'interactive',
      startedAt: Date.parse('2026-09-24T11:58:00.000Z'),
      sessionId: '00000000-0000-4000-8000-00000000000e',
      name: 'lantern-cove-12',
      status: 'idle',
    },
  ];
  cli.run = scriptedRunner({ claude: JSON.stringify(listing) }).run;
  expect((await mesa('sessions')).stdout).toBe(
    'ext-4242  lantern-cove  claude  idle  85%  0.33  ctx -  2m00s  not managed by mesa\n',
  );
  // --json carries the Decision behind each row, with its probabilities.
  expect((await mesa('sessions', '--json')).json.data).toMatchObject([
    {
      attention: expect.closeTo(1 / 3, 6),
      decision: {
        backend: 'rules',
        answers: [
          { id: 'state', answer: 'idle', probabilities: { idle: expect.closeTo(0.85, 6) } },
          { id: 'attention', probabilities: { low: expect.closeTo(2 / 3, 6) } },
          { id: 'human', answer: false, probabilities: expect.closeTo(0.06, 6) },
        ],
      },
      id: 'ext-4242',
      managed: false,
      agent: 'claude',
      pid: 4242,
      cwd: join(cli.home, 'src/lantern-cove'),
      agentSessionId: '00000000-0000-4000-8000-00000000000e',
      startedAt: '2026-09-24T11:58:00.000Z',
      project: 'lantern-cove',
      alive: true,
      agentStatus: 'idle',
      lastState: {
        state: 'idle',
        confidence: 0.85,
        at: '2026-09-24T12:00:00.000Z',
        source: 'listing',
      },
      runningSeconds: 120,
    },
  ]);
  for (const argv of [
    ['stop', 'ext-4242'],
    ['send', 'ext-4242', 'hi'],
    ['resume', 'ext-4242'],
    ['attach', 'ext-4242'],
  ]) {
    expect(await mesa(...argv), argv[0]).toMatchObject({
      code: 3,
      stderr: 'ext-4242: session not managed by mesa\n',
    });
  }
  const { json } = await mesa('stop', 'ext-4242', '--json');
  expect(json.error).toEqual({
    code: 'not_found',
    message: 'ext-4242: session not managed by mesa',
  });

  // Another profile's session is that board's, not a foreign one here.
  const work = join(cli.home, '.mesa/work/sessions');
  mkdirSync(work, { recursive: true });
  const theirs = { id: 'wwwwwwww', ...newSession(), events: [] };
  writeFileSync(
    join(work, 'wwwwwwww.json'),
    JSON.stringify({ ...theirs, agentSessionId: '00000000-0000-4000-8000-00000000000e' }),
  );
  expect((await mesa('sessions', '--json')).json.data).toEqual([]);
  rmSync(join(work, 'wwwwwwww.json'));

  // The process exits: the listing no longer names it, and its row is gone.
  cli.run = scriptedRunner({ claude: '[]' }).run;
  expect((await mesa('sessions')).stdout).toBe('no sessions; run mesa open <project>\n');
});

test('windows lists the profile tmux server; none is an empty list, no tmux exit 6', async () => {
  const scripted = scriptedRunner({
    tmux: `${tmuxLine({ project: 'lantern', window: 'claude-aaaaaa', dead: true })}\n`,
  });
  cli.run = scripted.run;
  const { json } = await mesa('windows', '--json');
  expect(json.data).toEqual([
    expect.objectContaining({ project: 'lantern', window: 'claude-aaaaaa', dead: true }),
  ]);
  expect((await mesa('windows', 'lantern')).stdout).toBe(
    'lantern:claude-aaaaaa  (exited)  /src/lantern\n',
  );
  expect(scripted.calls[1]?.args.slice(0, 6)).toEqual([
    '-L',
    'mesa-default',
    '-f',
    '/dev/null',
    'list-windows',
    '-t',
  ]);
  cli.run = scriptedRunner({ tmux: '' }).run;
  expect((await mesa('windows')).stdout).toBe('no Mesa tmux windows\n');
  cli.run = scriptedRunner({}, { missing: ['tmux'] }).run;
  expect(await mesa('windows')).toMatchObject({ code: 6 });
});

test('a Stop reads the context use: mesa sessions shows ctx, mesa show --json the context', async () => {
  cli.withTmux();
  await cli.withProject();
  const opened = (await mesa('open', 'lantern-cove', '--json')).json.data;
  const row = async () => (await mesa('sessions')).stdout;
  // No transcript yet: no reading, and nothing fails.
  expect(await row()).toContain(' ctx - ');
  expect((await mesa('show', opened.id, '--json')).json.data.context).toBeUndefined();

  const folder = join(cli.home, '.claude/projects/-src-lantern-cove');
  mkdirSync(folder, { recursive: true });
  const fixtures = join(
    import.meta.dirname,
    '../../../core/src/agents/claude/fixtures/transcripts',
  );
  copyFileSync(join(fixtures, 'normal-turn.jsonl'), join(folder, `${opened.agentSessionId}.jsonl`));
  cli.stdin = JSON.stringify({ session_id: opened.agentSessionId, hook_event_name: 'Stop' });
  cli.env = { MESA_SESSION_ID: opened.id, MESA_PROFILE: 'default' };
  await mesa('hook', 'claude');
  cli.env = {};
  expect(await row()).toMatch(new RegExp(`^${opened.id} .* ctx 21% `, 'm'));
  expect((await mesa('show', opened.id, '--json')).json.data.context).toEqual({
    used: 21.16,
    window: 200_000,
    at: '2026-09-25T10:00:09.000Z',
    source: 'transcript',
  });

  // mesa show reads it again: after a /compact there is none until the next reply.
  copyFileSync(
    join(fixtures, 'after-compaction.jsonl'),
    join(folder, `${opened.agentSessionId}.jsonl`),
  );
  expect((await mesa('show', opened.id, '--json')).json.data.context).toBeUndefined();
  expect(await row()).toContain(' ctx - ');
});
