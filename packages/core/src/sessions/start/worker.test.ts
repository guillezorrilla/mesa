import { expect, test } from 'vitest';
import { createMesa } from '../../mesa.js';
import {
  agentWorld,
  gitRepo,
  newSession,
  projectProfile,
  sequentialIds,
  tempDir,
  testDeps,
  testStore,
  withRealGit,
} from '../../testing/index.js';
import { workerBrief } from './goal.js';

const newId = sequentialIds();

/** lantern-cove registered as a git repository, and a session to be the parent. */
async function setUp() {
  const world = agentWorld();
  const { home, dir, mesa } = await projectProfile(withRealGit(world.run), {
    home: tempDir(),
    mesaYaml: 'name: lantern-cove\n',
    newId,
  });
  gitRepo(dir);
  const { result: parent } = await mesa.sessions.open('lantern-cove');
  /** A mesa whose caller is the Mesa window of session `id`, or none. */
  const from = (id?: string) =>
    createMesa(
      'default',
      testDeps(home, {
        run: withRealGit(world.run),
        env: id ? { MESA_SESSION_ID: id, MESA_PROFILE: 'default' } : {},
        newId,
      }),
    );
  return { home, mesa, parent, from };
}

test("a worker is the caller's child, in a new worktree on a branch Mesa names, its task briefed", async () => {
  const { parent, from } = await setUp();
  const { result } = await from(parent.id).sessions.worker('lantern-cove', 'Parse the tide tables');
  expect(result.parent).toBe(parent.id);
  expect(result.worktree?.branch).toMatch(/^session\/[a-z]+-[a-z]+-[0-9a-z]{4}$/);
  expect(result.goal).toBe(`Parse the tide tables\n\n${workerBrief(parent.id)}`);
  expect(result.brief).toBe(true);
});

test('a worker on --branch takes that branch; from outside a window it needs --parent', async () => {
  const { mesa, parent, from } = await setUp();
  const { result } = await from(parent.id).sessions.worker('lantern-cove', 'Chart it', {
    branch: 'tide-chart',
  });
  expect(result.worktree?.branch).toBe('tide-chart');
  const before = (await mesa.sessions.list('all')).length;
  await expect(from().sessions.worker('lantern-cove', 'x')).rejects.toMatchObject({
    code: 'usage',
    message: 'mesa worker runs inside a Mesa window; outside one pass --parent <id>',
  });
  await expect(
    from().sessions.worker('lantern-cove', 'x', { parent: 'zzzzzzzz' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(from(parent.id).sessions.worker(undefined, 'x')).rejects.toMatchObject({
    code: 'usage',
  });
  await expect(
    from(parent.id).sessions.worker('lantern-cove', 'x', { agent: 'terminal' }),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(await mesa.sessions.list('all')).toHaveLength(before);
  const outside = await from().sessions.worker('lantern-cove', 'Check it', { parent: parent.id });
  expect(outside.result).toMatchObject({ parent: parent.id, brief: true });
  expect(outside.result.worktree).toBeDefined();
  // A parent that has ended never reads a worker's reports.
  await mesa.sessions.stop(parent.id);
  await expect(
    from().sessions.worker('lantern-cove', 'x', { parent: parent.id }),
  ).rejects.toMatchObject({ code: 'usage', message: expect.stringContaining('has ended') });
});

test('workers nest at most 4 deep: depth 3 starts one, depth 4 is refused and starts nothing; a resume adds no level', async () => {
  const { home, mesa, parent, from } = await setUp();
  // A chain of children under the parent: depths 1, 2 and 3.
  let at = parent;
  for (let i = 0; i < 3; i++)
    at = (await mesa.sessions.open('lantern-cove', { parent: at.id, goal: `level ${i + 1}` }))
      .result;
  expect((await mesa.sessions.show(at.id)).depth).toBe(3);
  const { result: fourth } = await from(at.id).sessions.worker('lantern-cove', 'Count the buoys');
  expect((await mesa.sessions.show(fourth.id)).depth).toBe(4);
  expect((await mesa.sessions.show(parent.id)).depth).toBe(0);
  const before = (await mesa.sessions.list('all')).length;
  const refused = { code: 'usage', message: `${fourth.id} nests workers 4 deep; the limit is 4` };
  await expect(from(fourth.id).sessions.worker('lantern-cove', 'deeper')).rejects.toMatchObject(
    refused,
  );
  await expect(
    from(fourth.id).sessions.open('lantern-cove', { goal: 'deeper' }),
  ).rejects.toMatchObject(refused);
  await expect(
    mesa.sessions.open('lantern-cove', { goal: 'deeper', parent: fourth.id }),
  ).rejects.toMatchObject(refused);
  expect(await mesa.sessions.list('all')).toHaveLength(before);
  // A resume of the depth-3 session continues it: still depth 3, so its worker is depth 4.
  const store = testStore(home);
  const resumed = store.create(() => newSession({ parent: at.parent, resumedFrom: at.id }));
  store.update(at.id, (r) => ({ ...r, resumedBy: resumed.id, endedAt: r.startedAt }));
  expect((await mesa.sessions.show(resumed.id)).depth).toBe(3);
  expect((await mesa.sessions.show(fourth.id)).depth).toBe(4);
});
