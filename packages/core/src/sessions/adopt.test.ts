import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { codexHome, codexSessions } from '../agents/codex/paths.js';
import { createMesa } from '../mesa.js';
import { listReceipts } from '../receipts/store.js';
import {
  CLAUDE_MOUNT,
  codexWorld,
  fakeTmux,
  newSession,
  plantTranscript,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  shortIds,
  testDeps,
  testStore,
} from '../testing/index.js';

const LIVE = '36c173f2-803e-4845-bd97-a032b37c6d6d';
const ON_DISK = '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e7f';
const WARNING = 'end the session in its original terminal first: both hold the same transcript';

/**
 * A profile with lantern-cove registered, a fake tmux, and claude listing `listed` live: one
 * session running in lantern-cove unless told otherwise.
 */
function setUp(listed?: { sessionId: string; cwd: string }[]) {
  const world = fakeTmux();
  // The listing names the project's folder, known once the profile is made.
  let dir = '';
  const rows = () =>
    (listed ?? [{ sessionId: LIVE, cwd: dir }]).map((l, i) => ({
      pid: 4200 + i,
      startedAt: 1790276764032,
      status: 'idle',
      ...l,
    }));
  const scripted = scriptedRunner({
    tmux: world.answer,
    claude: (args) => (args.includes('agents') ? JSON.stringify(rows()) : '2.1.283 (Claude Code)'),
  });
  const made = projectProfile(scripted.run, { newId: sequentialIds() });
  dir = made.dir;
  return { ...made, world };
}

test('a live session is adopted into the project its folder is in, and reopened there', async () => {
  const { home, dir, mesa, world } = setUp();
  const { result, receipt } = await mesa.sessions.adopt(LIVE, { name: 'tide notes' });
  expect(result.warning).toBe(WARNING);
  expect(result.record).toMatchObject({
    project: 'lantern-cove',
    agent: 'claude',
    agentSessionId: LIVE,
    adopted: true,
    name: 'tide notes',
  });
  // The project's own folder: nothing more to keep.
  expect(result.record).not.toHaveProperty('cwd');
  expect(world.windows).toMatchObject([
    {
      window: result.record.tmux.window,
      path: dir,
      launch: `unset NO_COLOR; exec claude --resume ${LIVE} ${CLAUDE_MOUNT}`,
    },
  ]);
  expect(receipt).toBeNull();
  expect(listReceipts(join(home, 'vault'))).toEqual([]);

  // Mesa has it now, so a second adoption names the session.
  await expect(mesa.sessions.adopt(LIVE)).rejects.toMatchObject({
    code: 'usage',
    message: `Mesa has ${LIVE} already, as session ${result.record.id}`,
  });
});

test('a session on disk is found by its transcript, and reopened in the folder it ran in', async () => {
  const { home, dir, mesa, world } = setUp([]);
  const sub = join(dir, 'docs');
  mkdirSync(sub);
  plantTranscript(home, ON_DISK, sub);
  const { result } = await mesa.sessions.adopt(ON_DISK);
  // Inside lantern-cove, but not its folder: claude finds the conversation only in its own.
  expect(result.record).toMatchObject({ project: 'lantern-cove', cwd: sub });
  expect(world.windows.at(-1)).toMatchObject({
    path: sub,
    launch: `unset NO_COLOR; exec claude --resume ${ON_DISK} ${CLAUDE_MOUNT}`,
  });
});

test('--project places a session no registered project holds; a clash or none is refused', async () => {
  const { home, mesa } = setUp([]);
  const elsewhere = join(home, 'scratch');
  mkdirSync(elsewhere);
  plantTranscript(home, ON_DISK, elsewhere);
  await expect(mesa.sessions.adopt(ON_DISK)).rejects.toMatchObject({
    code: 'not_found',
    message: `no registered project holds ${elsewhere}: register it, or pass --project`,
  });
  await expect(mesa.sessions.adopt(ON_DISK, { project: 'tide' })).rejects.toMatchObject({
    code: 'not_found',
    message: 'no project named tide; see mesa projects',
  });
  const { result } = await mesa.sessions.adopt(ON_DISK, { project: 'lantern-cove' });
  expect(result.record).toMatchObject({ project: 'lantern-cove', cwd: elsewhere });

  const { mesa: other } = setUp();
  await expect(other.sessions.adopt(LIVE, { project: 'harbor' })).rejects.toMatchObject({
    code: 'usage',
    message: expect.stringMatching(
      /in project lantern-cove: drop --project, or pass --project lantern-cove$/,
    ),
  });
});

test('an unknown or malformed id, a blank name, or another profile holding it is refused', async () => {
  const { home, mesa } = setUp();
  await expect(mesa.sessions.adopt(ON_DISK)).rejects.toMatchObject({
    code: 'not_found',
    message: `no Claude Code or Codex session ${ON_DISK}, live or in ${join(home, '.claude/projects')}, ${codexSessions(codexHome({}, home))}`,
  });
  for (const id of ['../../etc/passwd', LIVE.toUpperCase(), 'a1b2c3d4']) {
    await expect(mesa.sessions.adopt(id)).rejects.toMatchObject({
      code: 'usage',
      message: `${id} is not a native session id (a lowercase UUID)`,
    });
  }
  await expect(mesa.sessions.adopt(LIVE, { name: ' ' })).rejects.toMatchObject({
    code: 'usage',
    message: 'the name is empty',
  });
  expect(listReceipts(join(home, 'vault'))).toEqual([]);

  // The work profile adopted it first.
  const work = createMesa('work', testDeps(home, { run: scriptedRunner().run }));
  work.init({ vault: 'vault' });
  testStore(home, 'work', shortIds('wwwwwwww')).create(() => ({
    ...newSession({
      lastState: { state: 'idle', confidence: 0.6, at: '2026-09-24T12:00:00.000Z', source: 'mesa' },
    }),
    agentSessionId: LIVE,
    tmux: { socket: 'mesa-work', session: 'lantern-cove', window: 'claude-wwwwwwww' },
  }));
  await expect(mesa.sessions.adopt(LIVE)).rejects.toMatchObject({
    code: 'usage',
    message: `another profile's session has ${LIVE} already`,
  });
  expect(await mesa.sessions.list()).toEqual([]);
});

test('--no-resume only records it; mesa resume then reopens it where it ran, still adopted', async () => {
  const { home, dir, mesa, world } = setUp([]);
  const sub = join(dir, 'docs');
  mkdirSync(sub);
  plantTranscript(home, ON_DISK, sub);
  const { result } = await mesa.sessions.adopt(ON_DISK, { noResume: true, name: 'docs' });
  expect(result.warning).toBe(WARNING);
  expect(world.windows).toEqual([]);
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  // Only recorded: the conversation runs outside Mesa, with no mount.
  expect((await mesa.sessions.show(result.record.id)).vault).toEqual({
    state: 'missing',
    reason: 'Resume through Mesa to mount the vault',
  });

  const { result: resumed } = await mesa.sessions.resume(result.record.id);
  expect(resumed.record).toMatchObject({ adopted: true, name: 'docs', cwd: sub });
  expect(world.windows).toMatchObject([
    { path: sub, launch: `unset NO_COLOR; exec claude --resume ${ON_DISK} ${CLAUDE_MOUNT}` },
  ]);
  expect((await mesa.sessions.show(resumed.record.id)).vault.state).toBe('configured');
});

test('an adoption links the enabled skills into the folder it reopens in, as open does', async () => {
  const { dir, mesa } = setUp();
  const { result } = await mesa.sessions.adopt(LIVE);
  expect(result.warning).toBe(WARNING);
  for (const skill of ['mesa', 'mesa-handoff']) {
    expect(existsSync(join(dir, '.claude/skills', skill, 'SKILL.md'))).toBe(true);
  }
});

test('an older Codex rollout is imported with its native id and actual cwd', async () => {
  const codex = codexWorld();
  const { run } = scriptedRunner({ claude: '[]' });
  const { mesa, dir } = projectProfile(run, { env: codex.env });
  const thread = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  const sub = join(dir, 'docs');
  mkdirSync(sub);
  codex.rollout({ id: thread, cwd: sub, startedAt: '2026-09-20T11:58:00.000Z' });
  const { result } = await mesa.sessions.adopt(thread);
  expect(result.record).toMatchObject({
    agent: 'codex',
    agentSessionId: thread,
    project: 'lantern-cove',
    cwd: sub,
    adopted: true,
  });
  expect(result.warning).toBe(WARNING);
  expect(await mesa.sessions.show(result.record.id)).toMatchObject({ agentSessionId: thread });
});

test('a headless Codex rollout is not imported as an interactive conversation', async () => {
  const codex = codexWorld();
  const { run } = scriptedRunner({ claude: '[]' });
  const { mesa, dir, home } = projectProfile(run, { env: codex.env });
  const thread = '01a0e14e-be41-72f1-a81b-e25d2198602a';
  codex.rollout({
    id: thread,
    cwd: dir,
    startedAt: '2026-09-20T11:58:00.000Z',
    originator: 'codex_exec',
  });
  await expect(mesa.sessions.adopt(thread)).rejects.toMatchObject({ code: 'not_found' });
  expect(testStore(home).list()).toEqual([]);
});
