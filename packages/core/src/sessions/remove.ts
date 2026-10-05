import { existsSync, rmSync } from 'node:fs';
import { antigravityLog } from '../agents/antigravity/log.js';
import { stopClaudeBackground } from '../agents/claude/background.js';
import { gitWorktrees } from '../git/checkout.js';
import { readGitStatus } from '../git/status.js';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { costTally } from '../usage/session-cost.js';
import { checkoutHolders, heldWorktrees, real, worktreeHolder } from './holders.js';
import { eventsLog } from './hook-events.js';
import { outputLog } from './output-log.js';
import { runInput, runOutput } from './run.js';
import type { SessionStore } from './store.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { windowOf } from './window-name.js';
import { deleteBranch, deleteWorktree, hasSubmodules, type Worktree } from './worktree.js';

/** What `mesa rm` took away: always the record, the rest when there was one to remove. */
export type Removed = {
  id: string;
  project: string;
  record: true;
  /** Its hook log, `sessions/events/<id>.jsonl`. */
  events: boolean;
  /** Its output log, `sessions/logs/<id>.log`. */
  outputLog: boolean;
  /** A skill run's result, `sessions/runs/<id>.json` (CONTEXT.md, Skill run). */
  runOutput: boolean;
  /** Its tmux window, live under `force`, or left dead. */
  window: boolean;
  worktree?: string;
  branch?: string;
  /** Each additional project's worktree and branch it removed (CONTEXT.md, Additional project). */
  additional?: { project: string; worktree?: string; branch?: string }[];
};

/**
 * Removes a session's record, its hook log, its output log, a run's output, and its cost tally,
 * with `deleteWorktree` its git worktree and each additional project's, and with `deleteBranch`
 * their branch. A queued session is refused, to be cancelled first; a live one is refused unless
 * `force`, which closes its window first; a worktree another session holds or runs in, or git has
 * locked, is refused, and one with changes or submodules unless `force`; a branch checked out where
 * the session does not hold it is refused, as is one its own worktree has without
 * `deleteWorktree`. Every refusal, for every repository, comes before anything goes, so a refused
 * rm leaves the session as it was, to retry.
 */
export async function removeSession(
  deps: {
    store: SessionStore;
    tmux: Pick<TmuxBackend, 'findWindow' | 'killWindow'>;
    run: Runner;
    profile: () => Profile;
    eventsDir: string;
    logsDir: string;
    /** The profile's runs/, where a run's output is. */
    runs: string;
    /** The profile's sessions/costs/, where a session's status line cost tally is. */
    costs: string;
  },
  id: string,
  { force = false, deleteWorktree: dropWorktree = false, deleteBranch: dropBranch = false } = {},
): Promise<Removed> {
  const record = deps.store.get(id);
  // Removing it would leave what waits on it waiting on nothing, so it would start at once.
  if (record.lastState.state === 'queued') {
    throw new MesaError('usage', `session ${id} is queued: mesa stop ${id} cancels it first`);
  }
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (record.backgroundId && !record.endedAt && !force) {
    throw new MesaError(
      'usage',
      `session ${id} may still run in Claude's background: mesa stop ${id} first`,
    );
  }
  if (pane && !pane.dead && !force) {
    throw new MesaError(
      'usage',
      `session ${id} is live: mesa stop ${id} first, or pass --force to close its window`,
    );
  }
  // Its own worktree, then each additional project's (heldWorktrees), each in its repository.
  const held = dropWorktree || dropBranch ? heldWorktrees(record) : [];
  if ((dropWorktree || dropBranch) && !held.length) {
    throw new MesaError('usage', `session ${id} has no worktree or branch of its own`);
  }
  const profile = held.length ? deps.profile() : undefined;
  const repos = profile
    ? held.map((h) => ({ ...h, repo: findProject(profile, h.project).path }))
    : [];
  // Every refusal for every repository comes before anything is removed.
  const registered = profile
    ? await refuseRemoval(deps, profile, id, repos, { force, dropWorktree, dropBranch })
    : new Set<string>();
  const removed: Removed = {
    id,
    project: record.project,
    record: true,
    events: false,
    outputLog: false,
    runOutput: false,
    window: false,
  };
  if (pane) {
    if (record.backgroundId && !record.endedAt)
      await stopClaudeBackground(deps.run, record.backgroundId);
    await killIfThere(deps.tmux, target);
    removed.window = true;
  } else if (record.backgroundId && !record.endedAt) {
    await stopClaudeBackground(deps.run, record.backgroundId);
  }
  for (const { worktree, repo } of dropWorktree ? repos : []) {
    if (existsSync(worktree.path)) await deleteWorktree(deps.run, repo, worktree, { force });
    // Its folder already gone: clear git's registration of it, if git still has one.
    else if (registered.has(worktree.path))
      await deleteWorktree(deps.run, repo, worktree, { force: true });
  }
  for (const { worktree, repo } of dropBranch ? repos : [])
    await deleteBranch(deps.run, repo, worktree.branch);
  const [own, ...others] = repos.map(({ project, worktree }) => ({
    project,
    ...(dropWorktree ? { worktree: worktree.path } : {}),
    ...(dropBranch ? { branch: worktree.branch } : {}),
  }));
  if (own?.worktree) removed.worktree = own.worktree;
  if (own?.branch) removed.branch = own.branch;
  if (others.length) removed.additional = others;
  const events = eventsLog(deps.eventsDir, id);
  removed.events = existsSync(events);
  rmSync(events, { force: true });
  const output = outputLog(deps.logsDir, id);
  removed.outputLog = existsSync(output);
  rmSync(output, { force: true });
  rmSync(antigravityLog(deps.logsDir, id), { force: true });
  const result = runOutput(deps.runs, id);
  removed.runOutput = existsSync(result);
  rmSync(result, { force: true });
  rmSync(runInput(deps.runs, id), { force: true });
  rmSync(costTally(deps.costs, id), { force: true });
  deps.store.remove(id);
  return removed;
}

/**
 * Refuses removing any of these worktrees, naming its project and path: one a newer session holds
 * now (a resume took it over), one another unfinished session runs in, one git has locked (even
 * with `force`, as git needs it twice), and, without `force`, one with submodules or with changes
 * or untracked files, as git would refuse it only once others were gone; with `dropBranch`, a branch
 * checked out in a worktree the session does not hold, or, without `dropWorktree`, in the one it
 * holds. One `git worktree list` per repository; it returns the held worktrees git lists, whose
 * registration rm clears when the folder is gone.
 */
async function refuseRemoval(
  deps: { store: SessionStore; run: Runner },
  profile: Profile,
  id: string,
  repos: readonly { project: string; worktree: Worktree; repo: string }[],
  {
    force,
    dropWorktree,
    dropBranch,
  }: { force: boolean; dropWorktree: boolean; dropBranch: boolean },
) {
  const records = deps.store.list();
  const registered = new Set<string>();
  for (const { project, worktree, repo } of repos) {
    const where = `${project}'s worktree at ${worktree.path}`;
    // git lists real paths.
    const at = real(worktree.path);
    const listed = (await gitWorktrees(deps.run, repo)).map((w) => ({ ...w, path: real(w.path) }));
    const own = listed.find((w) => w.path === at);
    if (own) registered.add(worktree.path);
    // git deletes no branch a worktree has checked out, so the worktree has to go first.
    if (dropBranch && !dropWorktree && own?.branch === worktree.branch)
      throw new MesaError(
        'usage',
        `${project}'s branch ${worktree.branch} is checked out in the session's worktree at ${worktree.path}: pass --delete-worktree too`,
      );
    const elsewhere = dropBranch
      ? listed.find((w) => w.branch === worktree.branch && w.path !== at)
      : undefined;
    if (elsewhere)
      throw new MesaError(
        'usage',
        `${project}'s branch ${worktree.branch} is checked out at ${elsewhere.path}`,
      );
    if (!dropWorktree) continue;
    const holder = worktreeHolder(deps.store, worktree.path);
    if (holder && holder.id !== id)
      throw new MesaError(
        'usage',
        `${where} is session ${holder.id}'s now; remove that one instead`,
      );
    const using = checkoutHolders(records, project, repo, at).find((r) => r.id !== id);
    if (using)
      throw new MesaError('usage', `session ${using.id} still uses ${where}; stop it first`);
    if (own?.locked !== undefined)
      throw new MesaError(
        'usage',
        `${where} is locked${own.locked ? ` (${own.locked})` : ''}: git worktree unlock ${worktree.path} first`,
      );
    if (force || !existsSync(worktree.path)) continue;
    if (await hasSubmodules(deps.run, worktree.path))
      throw new MesaError(
        'usage',
        `${where} has submodules: pass --force to remove it with their git data`,
      );
    const { changes } = await readGitStatus(profile, deps.run, project, worktree.path);
    if (changes.length)
      throw new MesaError(
        'usage',
        `${where} has changes or untracked files: commit or remove them, or pass --force`,
      );
  }
  return registered;
}
