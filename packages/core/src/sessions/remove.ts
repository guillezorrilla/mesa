import { existsSync, rmSync } from 'node:fs';
import type { Runner } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import type { Profile } from '../profile/profile.js';
import { findProject } from '../projects/projects.js';
import { worktreeHolder } from './holders.js';
import { eventsLog } from './hook-events.js';
import { outputLog } from './output-log.js';
import { runInput, runOutput } from './run.js';
import type { SessionStore } from './store.js';
import { killIfThere, type TmuxBackend } from './tmux/backend.js';
import { windowOf } from './window-name.js';
import { deleteBranch, deleteWorktree } from './worktree.js';

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
};

/**
 * Removes a session's record, its hook log, its output log, and a run's output, with
 * `deleteWorktree` its git worktree and with `deleteBranch` its branch. A queued session is refused, to be cancelled first; a live one is
 * refused unless `force`, which closes its window first; git refuses a dirty worktree unless `force`. Every refusal comes before the record goes,
 * so a refused rm leaves the session as it was, to retry.
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
  if (pane && !pane.dead && !force) {
    throw new MesaError(
      'usage',
      `session ${id} is live: mesa stop ${id} first, or pass --force to close its window`,
    );
  }
  const { worktree } = record;
  if ((dropWorktree || dropBranch) && !worktree) {
    throw new MesaError('usage', `session ${id} has no worktree or branch of its own`);
  }
  // A resume keeps the worktree: the session it was resumed as has it now.
  const holder = worktree && worktreeHolder(deps.store, worktree.path);
  if (dropWorktree && holder && holder.id !== id) {
    throw new MesaError(
      'usage',
      `the worktree at ${worktree?.path} is session ${holder.id}'s now; remove that one instead`,
    );
  }
  const repo =
    worktree && (dropWorktree || dropBranch)
      ? findProject(deps.profile(), record.project).path
      : '';
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
    await killIfThere(deps.tmux, target);
    removed.window = true;
  }
  if (worktree && dropWorktree) {
    if (existsSync(worktree.path)) await deleteWorktree(deps.run, repo, worktree, { force });
    // Its folder already gone: clear git's registration of it, if git still has one.
    else await deleteWorktree(deps.run, repo, worktree, { force: true }).catch(() => undefined);
    removed.worktree = worktree.path;
  }
  if (worktree && dropBranch) {
    await deleteBranch(deps.run, repo, worktree.branch);
    removed.branch = worktree.branch;
  }
  const events = eventsLog(deps.eventsDir, id);
  removed.events = existsSync(events);
  rmSync(events, { force: true });
  const output = outputLog(deps.logsDir, id);
  removed.outputLog = existsSync(output);
  rmSync(output, { force: true });
  const result = runOutput(deps.runs, id);
  removed.runOutput = existsSync(result);
  rmSync(result, { force: true });
  rmSync(runInput(deps.runs, id), { force: true });
  deps.store.remove(id);
  return removed;
}
