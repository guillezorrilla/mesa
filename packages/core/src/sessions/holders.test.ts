import { realpathSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  agentWorld,
  gitProject,
  gitRepo,
  newSession,
  projectProfile,
  shortIds,
  testStore,
  withRealGit,
} from '../testing/index.js';
import { checkoutHolders, requireOwnWorktree, worktreeHolder } from './holders.js';

test("an additional project's worktree is held by its session, as its own worktree is", async () => {
  const world = agentWorld();
  const { home, dir, mesa } = projectProfile(withRealGit(world.run));
  gitRepo(dir);
  const tide = gitProject(mesa, home, 'tide-pool');
  const { result: session } = await mesa.sessions.open('lantern-cove', {
    with: ['tide-pool'],
    branch: 'shared',
  });
  const held = session.additional?.[0]?.worktree.path ?? '';
  const real = realpathSync.native(held);
  const store = testStore(home);

  expect(worktreeHolder(store, held)?.id).toBe(session.id);
  expect(
    checkoutHolders(store.list(), 'tide-pool', realpathSync.native(tide), real).map((r) => r.id),
  ).toEqual([session.id]);
  // Not lantern-cove's checkout: the path is tide-pool's.
  expect(checkoutHolders(store.list(), 'lantern-cove', dir, real)).toEqual([]);
  const rows = await mesa.worktrees.list('tide-pool');
  expect(rows.find((row) => row.path === real)?.holders.map((h) => h.id)).toEqual([session.id]);
  const preview = await mesa.worktrees.preview('tide-pool', 'remove', held);
  expect(preview).toMatchObject({ allowed: false, holders: [session.id] });
  expect(preview.reasons).toContain(`session ${session.id} runs in this worktree; stop it first`);
  // Another session on that branch in tide-pool names the session that has it.
  await expect(mesa.sessions.open('tide-pool', { branch: 'shared' })).rejects.toMatchObject({
    code: 'usage',
    message: `session ${session.id} has shared's worktree at ${held}: use that session, or pick another branch`,
  });

  // Ended, it still references the worktree, and a newer session holding it takes it over.
  await mesa.sessions.stop(session.id, true);
  const ended = await mesa.worktrees.preview('tide-pool', 'remove', held);
  expect(ended.holders).toEqual([session.id]);
  expect(ended.reasons).toContain('a session still references this worktree');
  const newer = testStore(home, 'default', shortIds('newerone')).create(() =>
    newSession({
      worktree: { path: `${dir}-elsewhere`, branch: 'shared' },
      additional: [{ project: 'tide-pool', worktree: { path: held, branch: 'shared' } }],
    }),
  );
  expect(worktreeHolder(store, held)?.id).toBe(newer.id);
  expect(() => requireOwnWorktree(store, store.get(session.id))).toThrow(
    `the worktree at ${held} is session ${newer.id}'s now: two sessions never share one`,
  );
});
