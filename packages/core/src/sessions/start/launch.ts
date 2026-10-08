import { existsSync } from 'node:fs';
import { AgentSchema } from '../../agents/agents.js';
import {
  claudeBackgroundAttach,
  startClaudeBackground,
  stopClaudeBackground,
} from '../../agents/claude/background.js';
import { withMesaStatusLine } from '../../agents/claude/statusline.js';
import { hooksStatus as codexHooks } from '../../agents/codex/hooks.js';
import { codexHome } from '../../agents/codex/paths.js';
import { sandboxOverride } from '../../agents/launch-flags.js';
import { type Mounts, mountsPerLaunch } from '../../agents/mesa-mount.js';
import { AGENT_NAMES } from '../../agents/names.js';
import { readyAgent } from '../../doctor/probe.js';
import type { Clock } from '../../lib/clock.js';
import type { AsyncLockDeps } from '../../lib/lock-file.js';
import type { Env, Runner } from '../../lib/process.js';
import { MesaError, toFail } from '../../lib/result.js';
import { WINDOW_VARS } from '../../lib/window-vars.js';
import type { Profile } from '../../profile/profile.js';
import { type Project, readProjectFile } from '../../projects/project-file.js';
import { findProject, restoreProjectFile } from '../../projects/projects.js';
import type { RegistryEntry } from '../../projects/registry.js';
import { joinWarnings } from '../../receipts/recorder.js';
import { sessionWorktree } from '../../worktrees/create.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import { nestedAgentVars, type TmuxBackend } from '../tmux/backend.js';
import { windowEnv } from '../window/caller.js';
import { prepareOutputLog } from '../window/output-log.js';
import {
  type AdditionalStart,
  additionalDirs,
  createAdditional,
  launchWorktrees,
} from './additional.js';
import type { NewLaunch } from './new-record.js';
import { createRecord } from './new-record.js';
import { goalPreparing, sessionWindowCommand } from './window-command.js';

// Launching a session, the one sequence every start goes through (open, resume, adopt, handoff,
// and a queued start): its record, its worktree, its folder checked, the project's skills linked
// in, then its window, with its output log; and when the window cannot open, what the launch made
// removed again.

export type LaunchDeps = {
  profile: Profile;
  /** For MESA_PROFILE: a Profile knows its paths, not its name. */
  profileName: string;
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'openWindow'>;
  run: Runner;
  env: Env;
  home: string;
  self: readonly string[];
  clock: Clock;
  /** Links the project's enabled skills into the folder its agent runs in; throws on failure. */
  syncSkills: (project: string, folder: string) => void;
  /** Mesa's servers every agent command mounts (agents/mesa-mount.ts), read at each launch. */
  mounts: Mounts;
  /** For the locks a launch takes: a new worktree's, and the registry's. */
  lock: AsyncLockDeps;
};

/**
 * The registered project a session starts on, with its mesa.yaml read: a folder that is gone is
 * not_found, never an agent started in $HOME; a mesa.yaml that is gone is restored first.
 */
export function launchProject(profile: Profile, name: string) {
  const entry = findProject(profile, name);
  restoreProjectFile(entry);
  return { entry, project: readProjectFile(entry.path) };
}

/**
 * The agent a new session runs, ready to start (readyAgent): `asked`, else the project's, else
 * the profile's default. A name Mesa does not know is agent_unavailable.
 */
export async function launchAgent(
  deps: Pick<LaunchDeps, 'profile' | 'run'>,
  project?: Project,
  asked?: string,
) {
  const name = asked ?? project?.agent ?? deps.profile.config.defaultAgent;
  const parsed = AgentSchema.safeParse(name);
  if (!parsed.success) {
    const known = AGENT_NAMES.join(', ');
    throw new MesaError('agent_unavailable', `unknown agent ${name}; agents are ${known}`);
  }
  return { agent: parsed.data, spec: await readyAgent(deps.run, parsed.data) };
}

/** Where a session's agent runs: its own folder, else its worktree, else the project's. */
export const folderOf = (
  r: Pick<SessionRecord, 'cwd' | 'worktree'>,
  project: RegistryEntry | null,
) => {
  const folder = r.cwd ?? r.worktree?.path ?? project?.path;
  if (!folder) throw new MesaError('usage', 'General session has no working folder');
  return folder;
};

/** How a session's agent starts. */
type Start = {
  /** The agent's command line, for the record as it stands when its window opens. */
  command: (record: SessionRecord) => string;
  /** Its own worktree on this branch first (CONTEXT.md, Worktree), from `base` if new. */
  branch?: string;
  base?: string;
  /** Then a worktree on that branch in each of these (mesa open --with; additional.ts). */
  additional?: readonly AdditionalStart[];
};

/**
 * Starts the agent of a session already written: its worktree first when `branch` is asked for
 * and it has none (kept on the record at once, so a start retried after a kill finds it), then
 * one on that branch in each of `additional`'s projects (createAdditional), then its folders
 * checked, the project's enabled skills linked into it (a failure is the warning
 * returned, never an error), and `command` run in its window, whose output goes to the session's
 * output log while the config's `sessions.log` is on, and whose claude shows its estimated cost
 * in its status line while `sessions.statusLineCost` is on. When anything fails, every worktree
 * it made is removed again (launchWorktrees: one whose setup ran stays, named in the error), and
 * dropped from the record, so a retry can add it again.
 */
export async function startSession(
  deps: LaunchDeps,
  written: SessionRecord,
  project: RegistryEntry | null,
  start: Start,
): Promise<{ record: SessionRecord; warning?: string }> {
  let record = written;
  // A background process started before this launch keeps the mount it was started with.
  const attaching = Boolean(written.backgroundId);
  // A configured setup can create user data. A failed agent launch must leave it intact.
  const made = launchWorktrees(deps.run);
  let backgroundId: string | undefined;
  try {
    if (!record.worktree && start.branch !== undefined) {
      if (!project) throw new MesaError('usage', 'General sessions cannot use a worktree');
      const selected = await worktreeFor(deps, project, start.branch, start.base);
      made.add(deps.profile, project, selected);
      record = deps.store.update(record.id, { worktree: selected.worktree });
    }
    if (start.additional?.length)
      record = await createAdditional(deps, record, start.additional, made);
    const cwd = agentFolder(record, project);
    const hooks =
      record.agent === 'codex' ? codexHooks(codexHome(deps.home, deps.env), deps.self) : undefined;
    const warning = joinWarnings(
      record.kind === 'terminal' || !project ? undefined : syncSkillsInto(deps, project.name, cwd),
      ...(record.additional ?? []).map((a) => syncSkillsInto(deps, a.project, a.worktree.path)),
      hooks?.events.SessionStart && !hooks.trusted.SessionStart
        ? "Review and trust Mesa's hooks in Codex; this session starts without the Mesa pointer"
        : undefined,
      sandboxOverride(record.agent, deps.profile.config.agents, additionalDirs(record))?.warning,
    );
    if (record.background && !record.backgroundId) {
      const env = { ...deps.env };
      // No window variables: a supervisor this claude starts keeps its environment for every
      // later background job, Mesa's or not; the binding goes in the job's settings instead.
      for (const key of [...nestedAgentVars(deps.env), ...WINDOW_VARS]) delete env[key];
      delete env.NO_COLOR;
      backgroundId = await startClaudeBackground(
        deps.run,
        cwd,
        deps.mounts,
        windowEnv(record.id, deps.profileName),
        deps.profile.config.agents,
        additionalDirs(record),
        record.goal,
        record.mode,
        env,
      );
      record = deps.store.update(record.id, { backgroundId });
    }
    const { paths, config } = deps.profile;
    const command = record.backgroundId
      ? claudeBackgroundAttach(record.backgroundId)
      : record.agent === 'claude' && record.kind === 'interactive' && config.sessions.statusLineCost
        ? withMesaStatusLine(start.command(record), deps.self)
        : start.command(record);
    // What this launch mounts; a process it attaches to keeps what it was started with.
    const decisionsMounted = deps.mounts.decisions ? (true as const) : undefined;
    if (
      !attaching &&
      mountsPerLaunch(record.agent) &&
      (!record.vaultMounted || record.decisionsMounted !== decisionsMounted)
    )
      record = deps.store.update(record.id, { vaultMounted: true, decisionsMounted });
    await deps.tmux.openWindow({
      project: record.tmux.session,
      window: record.tmux.window,
      // claude keys its transcripts by cwd.
      cwd,
      command: sessionWindowCommand(
        record.agent,
        record.kind,
        command,
        goalPreparing(deps, record.kind, record.goal),
      ),
      env: windowEnv(record.id, deps.profileName),
      ...(config.sessions.log ? { log: prepareOutputLog(paths.logs, record.id) } : {}),
    });
    return { record, ...(warning ? { warning } : {}) };
  } catch (error) {
    if (backgroundId) await stopClaudeBackground(deps.run, backgroundId).catch(() => undefined);
    // What it removed leaves the record, so a retry makes it again; a worktree kept or stuck
    // stays. The additional ones are on the primary's branch, so they go with it.
    const removed = await made.undo();
    if (removed.length)
      deps.store.update(record.id, (r) => {
        const own = r.worktree !== undefined && removed.includes(r.worktree.path);
        const left = own
          ? []
          : (r.additional ?? []).filter((a) => !removed.includes(a.worktree.path));
        return {
          ...(own ? { worktree: undefined } : {}),
          additional: left.length ? left : undefined,
        };
      });
    throw made.named(error);
  }
}

/**
 * A new session: its record written, then `prepare`d (a handoff's note) and started
 * (startSession). When anything after the write fails, the record is removed again, with what
 * startSession made, and the error rethrown.
 */
export async function launchSession(
  deps: LaunchDeps,
  s: NewLaunch,
  start: Start & { prepare?: (created: SessionRecord) => SessionRecord },
): Promise<{ record: SessionRecord; warning?: string }> {
  const created = createRecord(deps, s);
  try {
    const record = start.prepare ? start.prepare(created) : created;
    return await startSession(deps, record, s.project, start);
  } catch (error) {
    deps.store.remove(created.id);
    throw error;
  }
}

/**
 * The folder a session's agent runs in, which must still be there, as must each additional
 * project's worktree: not_found when one is gone, as tmux would start the agent in $HOME, and a
 * skills sync would make the folder again.
 */
function agentFolder(record: SessionRecord, project: RegistryEntry | null) {
  const folder = folderOf(record, project);
  if (!existsSync(folder)) {
    throw new MesaError('not_found', `${folder} is gone: its agent has nowhere to run`);
  }
  for (const { project: other, worktree } of record.additional ?? []) {
    if (!existsSync(worktree.path))
      throw new MesaError(
        'not_found',
        `${other}'s worktree ${worktree.path} is gone: the session works there too`,
      );
  }
  return folder;
}

/**
 * Links the project's enabled skills into `folder` before its agent starts there, so it finds
 * them; a failure is the warning returned, never an error.
 */
function syncSkillsInto(deps: Pick<LaunchDeps, 'syncSkills'>, project: string, folder: string) {
  try {
    deps.syncSkills(project, folder);
    return undefined;
  } catch (error) {
    return `skills not synced into ${folder}: ${toFail(error).error.message}`;
  }
}

/** A new worktree on `branch`, unless a session has the worktree there. */
function worktreeFor(deps: LaunchDeps, entry: RegistryEntry, branch: string, base?: string) {
  return sessionWorktree(deps.profile, deps.run, deps.lock, deps.store, entry, branch, base);
}
