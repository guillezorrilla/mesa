import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  agentWorld,
  CLAUDE_MOUNT,
  CODEX_MOUNT,
  gitRepo,
  isolateGit,
  projectProfile,
  withRealGit,
} from '../testing/index.js';
import type { SessionRecord } from './record.js';

isolateGit({ beforeAll, afterAll });

// Every start through the launch owner mounts mesa-vault (agents/vault-mount.ts). Fresh, resume,
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
    await mesa.sessions.stop(to.id);
    const now = await mesa.sessions.show(queued.id);
    expect(window(queued)?.launch).toBe(started[agent](now, 'Chart the shoals'));
  },
);
