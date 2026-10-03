import { mkdirSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  codexWorld,
  newSession,
  plantTranscript,
  projectProfile,
  scriptedRunner,
  shortIds,
  testStore,
} from '../testing/index.js';

// The fixed clock is 2026-09-24T12:00:00.000Z.

const ids = {
  docs: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e70',
  worktree: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e71',
  loose: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e72',
  gone: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e73',
  old: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e74',
  held: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e75',
  heldElsewhere: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e76',
  live: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e77',
  codex: '01a0e14e-be41-72f1-a81b-e25d21986020',
  codexLive: '01a0e14e-be41-72f1-a81b-e25d21986021',
};

/** A transcript's lines: one naming its folder, then `extra` (title entries). */
const lines = (cwd: string, ...extra: object[]) =>
  [{ type: 'user', cwd, message: { role: 'user', content: 'Chart the tide' } }, ...extra]
    .map((l) => JSON.stringify(l))
    .join('\n');

/** A Claude Code transcript last written at `at`. */
function transcript(home: string, id: string, cwd: string, at: string, ...extra: object[]) {
  const file = plantTranscript(home, id, cwd, lines(cwd, ...extra));
  utimesSync(file, new Date(at), new Date(at));
}

/** A profile with lantern-cove registered and claude listing `listed` live. */
function setUp(listed: { sessionId: string; cwd: string; status?: string }[] = []) {
  const codex = codexWorld();
  const { run } = scriptedRunner({
    claude: (args) =>
      args.includes('agents')
        ? JSON.stringify(listed.map((l, i) => ({ pid: 4200 + i, startedAt: 1790276764032, ...l })))
        : '2.1.283 (Claude Code)',
  });
  const made = projectProfile(run, { env: codex.env, newId: shortIds('aaaaaaaa') });
  return { ...made, codex };
}

test('discover groups recent native conversations and live sessions by project folder, with native names', async () => {
  const lantern = { sessionId: ids.live, cwd: '', status: 'busy' };
  const { mesa, home, dir, codex } = setUp([lantern]);
  lantern.cwd = dir;
  const tide = join(home, 'src/tide-pool');
  mkdirSync(join(tide, '.git'), { recursive: true });
  mkdirSync(join(tide, 'docs'));
  const worktree = join(home, 'wt/tide-pool-fix');
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, '.git'), `gitdir: ${tide}/.git/worktrees/tide-pool-fix\n`);
  const loose = join(home, 'loose/notes');
  mkdirSync(loose, { recursive: true });

  const title = (customTitle: string) => ({ type: 'custom-title', customTitle });
  const aiTitle = (t: string) => ({ type: 'ai-title', aiTitle: t });
  transcript(
    home,
    ids.docs,
    join(tide, 'docs'),
    '2026-09-23T10:00:00.000Z',
    title('Old title'),
    aiTitle('Harbor charts'),
    title('Tide tables'),
    aiTitle('Later guess'),
  );
  transcript(
    home,
    ids.worktree,
    worktree,
    '2026-09-22T10:00:00.000Z',
    aiTitle('First guess'),
    aiTitle('Fix the tide pump'),
  );
  transcript(home, ids.loose, loose, '2026-09-21T10:00:00.000Z');
  transcript(home, ids.gone, join(home, 'gone/away'), '2026-09-20T10:00:00.000Z');
  // 31 days before the clock: outside the last 30.
  transcript(home, ids.old, dir, '2026-08-24T11:00:00.000Z');
  transcript(home, ids.held, dir, '2026-09-23T11:00:00.000Z');
  transcript(home, ids.heldElsewhere, dir, '2026-09-23T11:00:00.000Z');
  transcript(home, ids.live, dir, '2026-09-24T11:59:00.000Z', title('Live lantern'));
  codex.rollout({
    id: ids.codex,
    cwd: dir,
    startedAt: '2026-09-23T08:00:00.000Z',
    writtenAt: '2026-09-23T09:00:00.000Z',
  });
  codex.name(ids.codex, 'Lantern wicks');
  codex.name(ids.codex, 'Lantern lights');
  // Written in the last 10 minutes: Codex's listing has it live.
  codex.rollout({
    id: ids.codexLive,
    cwd: tide,
    startedAt: '2026-09-24T11:50:00.000Z',
    writtenAt: '2026-09-24T11:55:00.000Z',
  });
  testStore(home).create(() => newSession({ agentSessionId: ids.held }));
  testStore(home, 'work', shortIds('wwwwwwww')).create(() =>
    newSession({ agentSessionId: ids.heldElsewhere }),
  );

  const found = await mesa.sessions.discover(30);

  expect(found).toMatchObject({
    since: '2026-08-25T12:00:00.000Z',
    days: 30,
    total: 5,
    truncated: false,
    unsupported: [{ agent: 'antigravity', reason: 'No qualified native CLI history source' }],
  });
  expect(found.conversations).toEqual([
    {
      agent: 'claude',
      id: ids.docs,
      cwd: join(tide, 'docs'),
      project: tide,
      updatedAt: '2026-09-23T10:00:00.000Z',
      name: 'Tide tables',
    },
    {
      agent: 'codex',
      id: ids.codex,
      cwd: dir,
      project: dir,
      updatedAt: '2026-09-23T09:00:00.000Z',
      name: 'Lantern lights',
    },
    {
      agent: 'claude',
      id: ids.worktree,
      cwd: worktree,
      project: tide,
      updatedAt: '2026-09-22T10:00:00.000Z',
      name: 'Fix the tide pump',
    },
    {
      agent: 'claude',
      id: ids.loose,
      cwd: loose,
      project: null,
      updatedAt: '2026-09-21T10:00:00.000Z',
    },
    {
      agent: 'claude',
      id: ids.gone,
      cwd: join(home, 'gone/away'),
      project: null,
      updatedAt: '2026-09-20T10:00:00.000Z',
    },
  ]);
  expect(found.live).toEqual([
    { agent: 'claude', id: ids.live, cwd: dir, project: dir, name: 'Live lantern', status: 'busy' },
    { agent: 'codex', id: ids.codexLive, cwd: tide, project: tide },
  ]);
  expect(found.projects).toEqual([
    {
      path: dir,
      name: 'lantern-cove',
      configured: true,
      registered: true,
      conversations: 1,
      live: 1,
    },
    {
      path: tide,
      name: 'tide-pool',
      configured: false,
      registered: false,
      conversations: 2,
      live: 1,
    },
  ]);
});

test('past 300 recent conversations, the newest 300 are listed and the rest counted', async () => {
  const { mesa, home, dir } = setUp();
  for (let i = 0; i < 301; i++) {
    const id = `5b1e2f40-9c3d-4e7a-8f10-${String(i).padStart(12, '0')}`;
    const at = new Date(Date.parse('2026-09-24T00:00:00.000Z') - i * 60_000).toISOString();
    transcript(home, id, dir, at);
  }
  const found = await mesa.sessions.discover(7);
  expect(found).toMatchObject({ total: 301, truncated: true });
  expect(found.conversations).toHaveLength(300);
  expect(found.conversations.at(-1)?.id).toBe('5b1e2f40-9c3d-4e7a-8f10-000000000299');
  expect(found.projects).toMatchObject([{ path: dir, conversations: 301, live: 0 }]);
});

test('days outside 1 to 365 are refused, and a machine with nothing on it finds nothing', async () => {
  const { mesa } = setUp();
  for (const days of [0, 366, 1.5]) {
    await expect(mesa.sessions.discover(days)).rejects.toMatchObject({ code: 'usage' });
  }
  expect(await mesa.sessions.discover(1)).toMatchObject({
    projects: [],
    live: [],
    conversations: [],
    total: 0,
    truncated: false,
  });
});
