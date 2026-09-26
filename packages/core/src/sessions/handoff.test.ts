import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { agentWorld, gitRepo, isolateGit, projectProfile, withRealGit } from '../testing/index.js';

isolateGit({ beforeAll, afterAll });

/**
 * A profile with lantern-cove as a git repository, claude, a fake tmux, and a note file; the tmux
 * command `failing` fails.
 */
function setUp(failing?: string) {
  const { tmux, run } = agentWorld({ failing });
  const { home, dir, mesa } = projectProfile(withRealGit(run));
  gitRepo(dir);
  const note = join(home, 'note.md');
  writeFileSync(note, '## Verified\n## Assumed\n## Left out on purpose\n## Blocked\n');
  return { tmux, home, mesa, note };
}

test('the successor takes over the worktree: its window runs there, and the session cannot resume', async () => {
  const { tmux, mesa, note } = setUp();
  const a = (await mesa.sessions.open('lantern-cove', { goal: 'Tidy up', branch: 'tidy' })).result;
  const { result } = await mesa.sessions.handoff(a.id, { note });
  expect(result.to.worktree).toEqual(a.worktree);
  expect(tmux.windows.find((w) => w.window === `claude-${result.to.id}`)?.path).toBe(
    a.worktree?.path,
  );
  expect(existsSync(a.worktree?.path ?? '')).toBe(true);
  // Two sessions never share one: the successor has it now.
  await expect(mesa.sessions.resume(a.id)).rejects.toMatchObject({ code: 'usage' });
});

test('--keep is refused for a session in its own worktree, before anything is written', async () => {
  const { tmux, home, mesa, note } = setUp();
  const a = (await mesa.sessions.open('lantern-cove', { goal: 'Tidy up', branch: 'tidy' })).result;
  await expect(mesa.sessions.handoff(a.id, { note, keep: true })).rejects.toMatchObject({
    code: 'usage',
  });
  expect(tmux.windows).toHaveLength(1);
  expect(existsSync(join(home, '.mesa/default/handoffs'))).toBe(false);
});

test('a window that cannot open removes the successor and its note again', async () => {
  // The first window comes with its tmux session (new-session); the successor's is a new-window.
  const { home, mesa, note } = setUp('new-window');
  const a = (await mesa.sessions.open('lantern-cove', { goal: 'Tidy up' })).result;
  await expect(mesa.sessions.handoff(a.id, { note })).rejects.toMatchObject({ code: 'internal' });
  expect((await mesa.sessions.list(true)).map((r) => r.id)).toEqual([a.id]);
  expect(readdirSync(join(home, '.mesa/default/handoffs'))).toEqual([]);
  expect((await mesa.sessions.show(a.id)).events).toEqual([]);
});

test('a successor whose folder is gone is not_found, never an agent started in $HOME', async () => {
  const { tmux, mesa, note } = setUp();
  const a = (await mesa.sessions.open('lantern-cove', { goal: 'Tidy up', branch: 'tidy' })).result;
  rmSync(a.worktree?.path ?? '', { recursive: true, force: true });
  await expect(mesa.sessions.handoff(a.id, { note })).rejects.toMatchObject({ code: 'not_found' });
  expect(tmux.windows).toHaveLength(1);
  expect((await mesa.sessions.list(true)).map((r) => r.id)).toEqual([a.id]);
});
