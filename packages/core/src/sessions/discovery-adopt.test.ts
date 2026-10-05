import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { listReceipts } from '../receipts/store.js';
import {
  CLAUDE_MOUNT,
  datedTranscript,
  fakeTmux,
  newSession,
  projectProfile,
  scriptedRunner,
  sequentialIds,
  shortIds,
  testStore,
} from '../testing/index.js';

// The fixed clock is 2026-09-24T12:00:00.000Z.

const ids = {
  root: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e70',
  docs: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e71',
  old: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e72',
  held: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e73',
  worktree: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e74',
  live: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e75',
  elsewhere: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e76',
};
const WARNING = 'end the session in its original terminal first: both hold the same transcript';
const title = (customTitle: string) => ({ type: 'custom-title', customTitle });

/**
 * A profile with lantern-cove registered, a fake tmux, and an unregistered repository, tide-pool,
 * with two recent conversations, one older than 30 days, and one this profile holds; claude lists
 * `live` running in tide-pool when given, and fails its version check when `broken`.
 */
function setUp(live = false, broken = false) {
  const world = fakeTmux();
  let tide = '';
  const scripted = scriptedRunner({
    tmux: world.answer,
    claude: (args) =>
      args.includes('agents')
        ? JSON.stringify(
            live ? [{ pid: 4200, startedAt: 1790276764032, sessionId: ids.live, cwd: tide }] : [],
          )
        : broken
          ? { ok: false, reason: 'failed', detail: 'exit 1' }
          : '2.1.283 (Claude Code)',
  });
  const made = projectProfile(scripted.run, { newId: sequentialIds() });
  const { home } = made;
  tide = join(home, 'src/tide-pool');
  mkdirSync(join(tide, '.git'), { recursive: true });
  mkdirSync(join(tide, 'docs'));
  datedTranscript(home, ids.root, tide, '2026-09-23T10:00:00.000Z', title('Tide tables'));
  datedTranscript(home, ids.docs, join(tide, 'docs'), '2026-09-22T10:00:00.000Z');
  // 31 days before the clock: outside the last 30.
  datedTranscript(home, ids.old, tide, '2026-08-24T11:00:00.000Z');
  datedTranscript(home, ids.held, tide, '2026-09-23T11:00:00.000Z');
  testStore(home, 'default', shortIds('hhhhhhhh')).create(() =>
    newSession({ agentSessionId: ids.held }),
  );
  // Elsewhere: not tide-pool's.
  datedTranscript(home, ids.elsewhere, made.dir, '2026-09-23T11:00:00.000Z');
  if (live) datedTranscript(home, ids.live, tide, '2026-09-24T11:59:00.000Z', title('Live tide'));
  return { ...made, tide, world };
}

test('a folder is registered and its recent conversations adopted record-only, by native name, once', async () => {
  const { home, mesa, tide, world } = setUp();
  const { result } = await mesa.sessions.adoptDiscovered({ path: tide, days: 30 });
  expect(result).toEqual({
    project: 'tide-pool',
    registered: true,
    adopted: [
      { id: expect.any(String), agentSessionId: ids.root, agent: 'claude', name: 'Tide tables' },
      { id: expect.any(String), agentSessionId: ids.docs, agent: 'claude' },
    ],
    reopened: [],
    failed: [],
  });
  expect(mesa.projects.list().map((p) => p.name)).toEqual(['lantern-cove', 'tide-pool']);
  const store = testStore(home);
  expect(store.list().filter((s) => s.project === 'tide-pool')).toHaveLength(2);
  expect(store.get(result.adopted[0]?.id ?? '')).toMatchObject({
    adopted: true,
    agentSessionId: ids.root,
    name: 'Tide tables',
  });
  expect(store.get(result.adopted[1]?.id ?? '')).toMatchObject({
    adopted: true,
    cwd: join(tide, 'docs'),
  });
  // Record-only: no window opened.
  expect(world.windows).toEqual([]);

  const again = await mesa.sessions.adoptDiscovered({ path: tide, days: 30 });
  expect(again.result).toEqual({
    project: 'tide-pool',
    registered: false,
    adopted: [],
    reopened: [],
    failed: [],
  });
});

test('with live, the folder running sessions are reopened, the warning said, and one receipt kept', async () => {
  const { home, mesa, tide, world } = setUp(true);
  mesa.config.set('agents.claude.skipPermissions', 'true');
  const { result, receipt } = await mesa.sessions.adoptDiscovered({
    path: tide,
    days: 30,
    live: true,
  });
  expect(result.adopted.map((a) => a.agentSessionId)).toEqual([ids.root, ids.docs]);
  expect(result.reopened).toEqual([
    { id: expect.any(String), agentSessionId: ids.live, agent: 'claude', name: 'Live tide' },
  ]);
  expect(result.warning).toBe(WARNING);
  expect(world.windows).toMatchObject([
    {
      path: tide,
      launch: `unset NO_COLOR; exec claude --resume ${ids.live} --dangerously-skip-permissions ${CLAUDE_MOUNT}`,
    },
  ]);
  // One receipt for the batch, kept for its dangerous launch flags.
  expect(receipt).not.toBeNull();
  expect(listReceipts(join(home, 'vault')).map((r) => r.summary)).toEqual([
    'Adopted 3 sessions on tide-pool',
  ]);
});

test('without live, a running session is left alone', async () => {
  const { mesa, tide, world } = setUp(true);
  const { result } = await mesa.sessions.adoptDiscovered({ path: tide, days: 30 });
  expect(result.reopened).toEqual([]);
  expect(result).not.toHaveProperty('warning');
  expect(world.windows).toEqual([]);
});

test('a conversation in a worktree registered as its own project is adopted under that project', async () => {
  const { home, mesa, tide } = setUp();
  mesa.projects.register(tide, true);
  // A linked worktree of tide-pool, registered as its own project: discovery places its
  // conversation in tide-pool's folder, and the registry in tide-pool-fix, as `mesa adopt` would.
  const worktree = join(home, 'wt/tide-pool-fix');
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, '.git'), `gitdir: ${tide}/.git/worktrees/tide-pool-fix\n`);
  mkdirSync(join(tide, '.git/worktrees/tide-pool-fix'), { recursive: true });
  mesa.projects.register(worktree, true);
  datedTranscript(home, ids.worktree, worktree, '2026-09-24T10:00:00.000Z');

  const { result } = await mesa.sessions.adoptDiscovered({ path: tide, days: 30 });
  expect(result).toEqual({
    project: 'tide-pool',
    registered: false,
    adopted: [
      {
        id: expect.any(String),
        agentSessionId: ids.worktree,
        agent: 'claude',
        project: 'tide-pool-fix',
      },
      { id: expect.any(String), agentSessionId: ids.root, agent: 'claude', name: 'Tide tables' },
      { id: expect.any(String), agentSessionId: ids.docs, agent: 'claude' },
    ],
    reopened: [],
    failed: [],
  });
  const record = testStore(home).get(result.adopted[0]?.id ?? '');
  expect(record).toMatchObject({ project: 'tide-pool-fix', agentSessionId: ids.worktree });
  expect(record).not.toHaveProperty('cwd');
});

test('a running session whose agent is missing lands in failed while the rest are adopted', async () => {
  const { mesa, tide, world } = setUp(true, true);
  const { result } = await mesa.sessions.adoptDiscovered({ path: tide, days: 30, live: true });
  expect(result).toMatchObject({
    project: 'tide-pool',
    adopted: [{ agentSessionId: ids.root }, { agentSessionId: ids.docs }],
    reopened: [],
    failed: [{ agentSessionId: ids.live, reason: expect.stringContaining('claude') }],
  });
  expect(result).not.toHaveProperty('warning');
  expect(world.windows).toEqual([]);
});

test('a path that is not a folder is not_found', async () => {
  const { home, mesa } = setUp();
  await expect(
    mesa.sessions.adoptDiscovered({ path: join(home, 'nowhere'), days: 30 }),
  ).rejects.toMatchObject({ code: 'not_found' });
});
