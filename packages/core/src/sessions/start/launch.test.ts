import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { shellWord } from '../../lib/process.js';
import {
  agentWorld,
  CLAUDE_MOUNT,
  CODEX_MOUNT,
  gitRepo,
  newSession,
  projectProfile,
  shortIds,
  testStore,
  withRealGit,
} from '../../testing/index.js';
import type { SessionRecord } from '../record/record.js';

// Every start through the launch owner mounts mesa-vault (agents/mesa-mount.ts). Fresh, resume,
// fork, background, adopted, and headless starts are checked beside their own tests; these are
// the rest: a worktree start, a handoff's successor, and a queued start.

/** The window command each agent's start runs, with its goal as one shell word. */
const started = {
  claude: (r: SessionRecord, goal: string) =>
    `unset NO_COLOR; exec claude --session-id ${r.agentSessionId} ${CLAUDE_MOUNT} '${goal}'`,
  codex: (_r: SessionRecord, goal: string) =>
    `codex -c mesa.embedded=true ${CODEX_MOUNT} -- '${goal}'`,
};

test.each(['claude', 'codex'] as const)(
  '%s mounts mesa-vault in a worktree start, a handoff successor, and a queued start',
  async (agent) => {
    const world = agentWorld();
    const { home, dir, mesa } = projectProfile(withRealGit(world.run));
    gitRepo(dir);
    const window = (r: SessionRecord) =>
      world.tmux.windows.find((w) => w.window === `${agent}-${r.id}`);

    const first = (
      await mesa.sessions.open('lantern-cove', { agent, goal: 'Map the tides', branch: 'tides' })
    ).result;
    expect(window(first)).toMatchObject({
      path: first.worktree?.path,
      launch: started[agent](first, 'Map the tides'),
    });

    const note = join(home, 'note.md');
    writeFileSync(note, '## Verified\n## Left\n');
    const { to, note: kept } = (await mesa.sessions.handoff(first.id, { note })).result;
    expect(window(to)).toMatchObject({
      path: first.worktree?.path,
      launch: started[agent](to, `Map the tides\n\nRead the handoff note at ${kept} first.`),
    });

    const queued = (
      await mesa.sessions.open('lantern-cove', { agent, goal: 'Chart the shoals', after: to.id })
    ).result;
    expect(window(queued)).toBeUndefined();
    expect((await mesa.sessions.show(queued.id)).vault).toEqual({
      state: 'missing',
      reason: 'Mounted when the queued session starts',
    });
    await mesa.sessions.stop(to.id);
    const now = await mesa.sessions.show(queued.id);
    expect(window(queued)?.launch).toBe(started[agent](now, 'Chart the shoals'));
    // Each launch marks its record, which show reads.
    for (const r of [first, to, now]) {
      expect((await mesa.sessions.show(r.id)).vault).toEqual({
        state: 'configured',
        reason: 'mesa-vault is mounted in its launch command',
      });
    }
  },
);

test('a record Mesa launched before the mount existed reports it missing until resumed', async () => {
  const world = agentWorld();
  const { home, mesa } = projectProfile(world.run);
  // As a mesa from before the mount wrote it: no vaultMounted.
  const old = testStore(home, 'default', shortIds('oldmount')).create(() =>
    newSession({ agentSessionId: '00000000-0000-4000-8000-0000000000aa' }),
  );
  expect((await mesa.sessions.show(old.id)).vault).toEqual({
    state: 'missing',
    reason: 'Resume through Mesa to mount the vault',
  });
  for (const w of world.tmux.windows) w.dead = true;
  await mesa.sessions.stop(old.id, true);
  const resumed = (await mesa.sessions.resume(old.id)).result.record;
  expect(resumed.vaultMounted).toBe(true);
  expect((await mesa.sessions.show(resumed.id)).vault.state).toBe('configured');
});

test('with sessions.statusLineCost on, claude windows launch with mesa statusline in --settings; off, unchanged', async () => {
  const world = agentWorld();
  const { mesa } = projectProfile(world.run);
  const window = (r: SessionRecord) =>
    world.tmux.windows.find((w) => w.window === `${r.agent}-${r.id}`);
  const before = (await mesa.sessions.open('lantern-cove', { goal: 'Map the tides' })).result;
  expect(window(before)?.launch).toBe(started.claude(before, 'Map the tides'));

  mesa.config.set('sessions.statusLineCost', 'true');
  // testDeps' self is /usr/local/bin/mesa: the status line runs that mesa, not one on PATH.
  const settings = shellWord(
    `--settings=${JSON.stringify({
      statusLine: { type: 'command', command: "'/usr/local/bin/mesa' statusline" },
    })}`,
  );
  const on = (await mesa.sessions.open('lantern-cove', { goal: 'Map the tides' })).result;
  expect(window(on)?.launch).toBe(
    `unset NO_COLOR; exec claude ${settings} --session-id ${on.agentSessionId} ${CLAUDE_MOUNT} 'Map the tides'`,
  );
  for (const w of world.tmux.windows) w.dead = true;
  await mesa.sessions.stop(on.id, true);
  const resumed = (await mesa.sessions.resume(on.id)).result.record;
  expect(window(resumed)?.launch).toBe(
    `unset NO_COLOR; exec claude ${settings} --resume ${on.agentSessionId} ${CLAUDE_MOUNT}`,
  );
  // Codex has no Claude status line.
  const codex = (
    await mesa.sessions.open('lantern-cove', { agent: 'codex', goal: 'Map the tides' })
  ).result;
  expect(window(codex)?.launch).toBe(started.codex(codex, 'Map the tides'));

  mesa.config.set('sessions.statusLineCost', 'false');
  const after = (await mesa.sessions.open('lantern-cove', { goal: 'Map the tides' })).result;
  expect(window(after)?.launch).toBe(started.claude(after, 'Map the tides'));
});
