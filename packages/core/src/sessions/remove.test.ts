import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { profilePaths } from '../profile/paths.js';
import { listReceipts } from '../receipts/store.js';
import {
  CLAUDE_VERSION,
  fakeTmux,
  gitRepo,
  plantOutputLog,
  projectProfile,
  scriptedRunner,
  testGit,
  twoProjects,
  withRealGit,
} from '../testing/index.js';
import { costTally } from '../usage/session-cost.js';
import { runInput } from './run.js';

/** lantern-cove as a git repository, in a profile over a fake tmux with the real git. */
function setUp() {
  const world = fakeTmux();
  const scripted = scriptedRunner({ tmux: world.answer, claude: CLAUDE_VERSION });
  const made = projectProfile(withRealGit(scripted.run));
  gitRepo(made.dir);
  const exit = (window: string) => {
    const w = world.windows.find((x) => x.window === window);
    if (w) w.dead = true;
  };
  return { ...made, world, exit };
}

test('show prints the record with alive; an unknown id is not_found', async () => {
  const { mesa, exit } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  expect(await mesa.sessions.show(result.id)).toMatchObject({ id: result.id, alive: true });
  exit(result.tmux.window);
  // A dead pane's window still exists: alive, as the board counts it, until it is gone.
  expect((await mesa.sessions.show(result.id)).alive).toBe(true);
  await expect(mesa.sessions.show('zzzzzzzz')).rejects.toMatchObject({ code: 'not_found' });
});

test('rename stores the name and the board carries it; a blank one is refused', async () => {
  const { home, mesa } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  const { result: renamed, receipt } = mesa.sessions.rename(result.id, '  tide tables ');
  expect(renamed.name).toBe('tide tables');
  const [row] = await mesa.sessions.list();
  expect(row).toMatchObject({ id: result.id, name: 'tide tables' });
  expect(receipt).toBeNull();
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
  expect(() => mesa.sessions.rename(result.id, ' ')).toThrow(
    expect.objectContaining({ code: 'usage', message: 'the name is empty' }),
  );
});

test('workflow label persists independently of Faro state and can be cleared', async () => {
  const { mesa } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  const state = result.lastState;
  expect(mesa.sessions.workflow(result.id, 'review').result).toMatchObject({
    workflowStatus: 'review',
    lastState: state,
  });
  expect((await mesa.sessions.list())[0]).toMatchObject({ workflowStatus: 'review' });
  expect(mesa.sessions.workflow(result.id, 'clear').result.workflowStatus).toBeUndefined();
  expect(() => mesa.sessions.workflow(result.id, 'waiting-permission')).toThrow(
    expect.objectContaining({ code: 'usage' }),
  );
  expect(mesa.sessions.workflow(result.id, 'done').result.lastState).toEqual(state);
});

test('rm refuses a live session; --force closes its window, then removes the record and logs', async () => {
  const { home, mesa, world } = setUp();
  const { result } = await mesa.sessions.open('lantern-cove');
  const events = join(profilePaths(home, 'default').events, `${result.id}.jsonl`);
  mkdirSync(profilePaths(home, 'default').events, { recursive: true });
  writeFileSync(events, '{}\n');
  const output = plantOutputLog(home, result.id, 'Reading the tide tables\n');
  const runs = profilePaths(home, 'default').runs;
  mkdirSync(runs, { recursive: true });
  const input = runInput(runs, result.id);
  writeFileSync(input, 'Invented summary input');
  const costs = profilePaths(home, 'default').costs;
  mkdirSync(costs, { recursive: true });
  const tally = costTally(costs, result.id);
  writeFileSync(tally, '{}\n');
  await expect(mesa.sessions.remove(result.id)).rejects.toMatchObject({
    code: 'usage',
    message: `session ${result.id} is live: mesa stop ${result.id} first, or pass --force to close its window`,
  });
  expect(world.windows).toHaveLength(1);
  const { result: removed, receipt } = await mesa.sessions.remove(result.id, { force: true });
  expect(removed).toEqual({
    id: result.id,
    project: 'lantern-cove',
    record: true,
    events: true,
    outputLog: true,
    runOutput: false,
    window: true,
  });
  expect(world.windows).toEqual([]);
  expect(existsSync(events)).toBe(false);
  expect(existsSync(output)).toBe(false);
  expect(existsSync(input)).toBe(false);
  expect(existsSync(tally)).toBe(false);
  await expect(mesa.sessions.show(result.id)).rejects.toMatchObject({ code: 'not_found' });
  expect(receipt).toBeNull();
  expect(listReceipts(join(home, 'vault'))).toEqual([]);
});

test('--delete-worktree removes a clean worktree, refuses a dirty one unless --force; --delete-branch deletes it', async () => {
  const { dir, mesa, exit } = setUp();
  const { result: clean } = await mesa.sessions.open('lantern-cove', { branch: 'clean' });
  exit(clean.tmux.window);
  const path = clean.worktree?.path ?? '';
  const { result } = await mesa.sessions.remove(clean.id, {
    deleteWorktree: true,
    deleteBranch: true,
  });
  expect(result).toMatchObject({ worktree: path, branch: 'clean', window: true });
  expect(existsSync(path)).toBe(false);
  expect(testGit(dir, 'branch', '--list', 'clean')).toBe('');

  const { result: dirty } = await mesa.sessions.open('lantern-cove', { branch: 'dirty' });
  exit(dirty.tmux.window);
  writeFileSync(join(dirty.worktree?.path ?? '', 'notes.md'), 'unsaved\n');
  await expect(mesa.sessions.remove(dirty.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: `lantern-cove's worktree at ${dirty.worktree?.path} has changes or untracked files: commit or remove them, or pass --force`,
  });
  // Refused before the record went: it is still there to retry.
  expect((await mesa.sessions.show(dirty.id)).worktree?.branch).toBe('dirty');
  await mesa.sessions.remove(dirty.id, { deleteWorktree: true, force: true });
  expect(existsSync(dirty.worktree?.path ?? '')).toBe(false);
  // The branch stays without --delete-branch.
  expect(testGit(dir, 'branch', '--list', 'dirty')).toBe('dirty');

  const { result: plain } = await mesa.sessions.open('lantern-cove');
  await expect(
    mesa.sessions.remove(plain.id, { force: true, deleteBranch: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `session ${plain.id} has no worktree or branch of its own`,
  });
});

test('rm of a session resumed since leaves the worktree the newer session has', async () => {
  const { mesa, exit } = setUp();
  const { result: first } = await mesa.sessions.open('lantern-cove', { branch: 'kept' });
  exit(first.tmux.window);
  const { result: resumed } = await mesa.sessions.resume(first.id);
  await expect(mesa.sessions.remove(first.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: `lantern-cove's worktree at ${first.worktree?.path} is session ${resumed.record.id}'s now; remove that one instead`,
  });
  // Without the flag, the old record goes and the worktree stays with the new one.
  await mesa.sessions.remove(first.id);
  expect(existsSync(first.worktree?.path ?? '')).toBe(true);
});

/** A stopped session across lantern-cove and tide-pool on `branch`, through the real git. */
async function acrossProjects(branch = 'shared') {
  const made = twoProjects();
  const { result } = await made.mesa.sessions.open('lantern-cove', { with: ['tide-pool'], branch });
  await made.mesa.sessions.stop(result.id, true);
  const own = result.worktree?.path ?? '';
  const other = result.additional?.[0]?.worktree.path ?? '';
  const branches = () =>
    [made.dir, made.tide].map((repo) => testGit(repo, 'branch', '--list', branch));
  return { ...made, session: result, own, other, branches };
}

test("--delete-worktree --delete-branch removes every project's worktree and branch, and says so", async () => {
  const { mesa, session, own, other, branches } = await acrossProjects();
  const { result } = await mesa.sessions.remove(session.id, {
    deleteWorktree: true,
    deleteBranch: true,
  });
  expect(result).toMatchObject({
    worktree: own,
    branch: 'shared',
    additional: [{ project: 'tide-pool', worktree: other, branch: 'shared' }],
  });
  expect([existsSync(own), existsSync(other)]).toEqual([false, false]);
  expect(branches()).toEqual(['', '']);
});

test('an untracked file in an additional worktree refuses before anything goes; --force removes both', async () => {
  const { mesa, session, own, other, branches } = await acrossProjects();
  writeFileSync(join(other, 'notes.md'), 'unsaved\n');
  await expect(
    mesa.sessions.remove(session.id, { deleteWorktree: true, deleteBranch: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `tide-pool's worktree at ${other} has changes or untracked files: commit or remove them, or pass --force`,
  });
  expect([existsSync(own), existsSync(other)]).toEqual([true, true]);
  expect(branches()).toEqual(['+ shared', '+ shared']);
  expect((await mesa.sessions.show(session.id)).additional).toEqual(session.additional);

  await mesa.sessions.remove(session.id, { deleteWorktree: true, force: true });
  expect([existsSync(own), existsSync(other)]).toEqual([false, false]);
  // The branches stay without --delete-branch.
  expect(branches()).toEqual(['shared', 'shared']);
});

test('a retried rm passes over a worktree and branch already gone in one repository', async () => {
  const { mesa, dir, session, own, other, branches } = await acrossProjects();
  // An rm that failed mid-way: lantern-cove's worktree and branch went, tide-pool's did not.
  testGit(dir, 'worktree', 'remove', own);
  testGit(dir, 'branch', '-D', 'shared');
  await mesa.sessions.remove(session.id, { deleteWorktree: true, deleteBranch: true });
  expect([existsSync(own), existsSync(other)]).toEqual([false, false]);
  expect(branches()).toEqual(['', '']);
});

test('a locked worktree in the second repository refuses rm, even with --force, before anything goes', async () => {
  const { mesa, tide, session, own, other, branches } = await acrossProjects();
  testGit(tide, 'worktree', 'lock', '--reason', 'on usb', other);
  await expect(
    mesa.sessions.remove(session.id, { deleteWorktree: true, force: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `tide-pool's worktree at ${other} is locked (on usb): git worktree unlock ${other} first`,
  });
  expect([existsSync(own), existsSync(other)]).toEqual([true, true]);
  expect(branches()).toEqual(['+ shared', '+ shared']);
  expect((await mesa.sessions.show(session.id)).id).toBe(session.id);
});

test('a locked worktree whose folder is gone is refused, not reported removed', async () => {
  const { mesa, tide, session, other } = await acrossProjects();
  testGit(tide, 'worktree', 'lock', '--reason', 'on usb', other);
  rmSync(other, { recursive: true });
  await expect(
    mesa.sessions.remove(session.id, { deleteWorktree: true, force: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `tide-pool's worktree at ${other} is locked (on usb): git worktree unlock ${other} first`,
  });
  expect((await mesa.sessions.show(session.id)).id).toBe(session.id);
  expect(testGit(tide, 'worktree', 'list', '--porcelain')).toContain(`worktree ${other}\n`);
});

test('an initialized submodule in the second repository refuses rm without --force; --force removes both', async () => {
  const { mesa, dir, session, own, other, branches } = await acrossProjects();
  testGit(other, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', dir, 'sub');
  testGit(other, 'commit', '-qm', 'sub');
  await expect(mesa.sessions.remove(session.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: `tide-pool's worktree at ${other} has submodules: pass --force to remove it with their git data`,
  });
  expect([existsSync(own), existsSync(other)]).toEqual([true, true]);
  expect(branches()).toEqual(['+ shared', '+ shared']);
  expect((await mesa.sessions.show(session.id)).id).toBe(session.id);

  await mesa.sessions.remove(session.id, { deleteWorktree: true, force: true });
  expect([existsSync(own), existsSync(other)]).toEqual([false, false]);
});

test('a branch checked out elsewhere in the second repository refuses --delete-branch before anything goes', async () => {
  const { mesa, home, tide, session, own, other, branches } = await acrossProjects();
  const elsewhere = join(home, 'elsewhere');
  testGit(tide, 'worktree', 'add', '-f', elsewhere, 'shared');
  await expect(
    mesa.sessions.remove(session.id, { deleteWorktree: true, deleteBranch: true }),
  ).rejects.toMatchObject({
    code: 'usage',
    message: `tide-pool's branch shared is checked out at ${elsewhere}`,
  });
  expect([existsSync(own), existsSync(other)]).toEqual([true, true]);
  expect(branches()).toEqual(['+ shared', '+ shared']);
  expect((await mesa.sessions.show(session.id)).id).toBe(session.id);
});

test('worktrees a resumed successor holds now are refused, naming the project and path', async () => {
  const { mesa, session, own, other } = await acrossProjects();
  const { result: resumed } = await mesa.sessions.resume(session.id);
  await expect(mesa.sessions.remove(session.id, { deleteWorktree: true })).rejects.toMatchObject({
    code: 'usage',
    message: `lantern-cove's worktree at ${own} is session ${resumed.record.id}'s now; remove that one instead`,
  });
  expect([existsSync(own), existsSync(other)]).toEqual([true, true]);
  expect((await mesa.sessions.show(session.id)).id).toBe(session.id);
});

test("rm --descendants --delete-worktree removes a descendant's worktrees in every project", async () => {
  const { mesa, tide } = twoProjects();
  const parent = (await mesa.sessions.open('lantern-cove')).result;
  const child = (
    await mesa.sessions.open('lantern-cove', { parent: parent.id, with: ['tide-pool'] })
  ).result;
  for (const id of [child.id, parent.id]) await mesa.sessions.stop(id, true);
  const removed = await mesa.sessions.removeDescendants(
    parent.id,
    { deleteWorktree: true, deleteBranch: true },
    [child.id, parent.id],
  );
  expect(removed.items.map((item) => [item.id, item.ok])).toEqual([
    [child.id, true],
    [parent.id, true],
  ]);
  const other = child.additional?.[0]?.worktree;
  expect(existsSync(other?.path ?? '')).toBe(false);
  expect(testGit(tide, 'branch', '--list', other?.branch ?? '')).toBe('');
});
