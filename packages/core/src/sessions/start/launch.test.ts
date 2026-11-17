import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { shellWord } from '../../lib/process.js';
import {
  agentWorld,
  CLAUDE_MESA,
  gitRepo,
  newSession,
  projectProfile,
  shortIds,
  testStore,
  withRealGit,
} from '../../testing/index.js';
import type { SessionRecord } from '../record/record.js';

// Every start through the launch owner allows Mesa's commands and mounts no server
// (agents/mesa-commands.ts, ADR-0031). Fresh, resume, fork, background, adopted, and headless
// starts are checked beside their own tests; these are the rest: a worktree start, a handoff's
// successor, and a queued start.

/** The window command each agent's start runs, with its goal as one shell word. */
const started = {
  claude: (r: SessionRecord, goal: string) =>
    `unset NO_COLOR; exec claude --session-id ${r.agentSessionId} ${CLAUDE_MESA} '${goal}'`,
  codex: (_r: SessionRecord, goal: string) => `codex -c mesa.embedded=true -- '${goal}'`,
};

test.each(['claude', 'codex'] as const)(
  '%s allows the mesa commands in a worktree start, a handoff successor, and a queued start',
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
    await mesa.sessions.stop(to.id);
    const now = await mesa.sessions.show(queued.id);
    expect(window(queued)?.launch).toBe(started[agent](now, 'Chart the shoals'));
    // The vault is the CLI's: every agent session reaches it, queued or launched.
    for (const r of [first, to, now]) {
      expect((await mesa.sessions.show(r.id)).vault).toEqual({
        state: 'configured',
        reason: 'The mesa vault commands, through the mesa-vault skill',
      });
    }
  },
);

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
    `unset NO_COLOR; exec claude ${settings} --session-id ${on.agentSessionId} ${CLAUDE_MESA} 'Map the tides'`,
  );
  for (const w of world.tmux.windows) w.dead = true;
  await mesa.sessions.stop(on.id, true);
  const resumed = (await mesa.sessions.resume(on.id)).result.record;
  expect(window(resumed)?.launch).toBe(
    `unset NO_COLOR; exec claude ${settings} --resume ${on.agentSessionId} ${CLAUDE_MESA}`,
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

test('a record launched with the old mounts resumes and forks with the mesa commands, and no server', async () => {
  const world = agentWorld();
  const { home, dir, mesa } = projectProfile(withRealGit(world.run));
  gitRepo(dir);
  // As a mesa before ADR-0031 wrote it: mounted with mesa-vault and mesa-decisions.
  const old = testStore(home, 'default', shortIds('oldmount')).create(() => ({
    ...newSession({ agentSessionId: '00000000-0000-4000-8000-0000000000aa' }),
    vaultMounted: true,
    decisionsMounted: true,
  }));
  for (const w of world.tmux.windows) w.dead = true;
  await mesa.sessions.stop(old.id, true);
  const resumed = (await mesa.sessions.resume(old.id)).result.record;
  const forked = (await mesa.sessions.fork(resumed.id)).result;
  const launch = (r: SessionRecord) =>
    world.tmux.windows.find((w) => w.window === `claude-${r.id}`)?.launch ?? '';
  expect(launch(resumed)).toBe(
    `unset NO_COLOR; exec claude --resume 00000000-0000-4000-8000-0000000000aa ${CLAUDE_MESA}`,
  );
  for (const r of [resumed, forked]) {
    expect(launch(r)).toContain(CLAUDE_MESA);
    expect(launch(r)).not.toMatch(/mcp-config|mcp__mesa/);
    expect(r).not.toHaveProperty('vaultMounted');
    expect(r).not.toHaveProperty('decisionsMounted');
  }
});
