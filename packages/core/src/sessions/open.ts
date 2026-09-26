import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_NAMES, AGENTS, type Agent, AgentSchema } from '../agents.js';
import type { Clock } from '../clock.js';
import { checkAgent } from '../doctor.js';
import type { IdSource } from '../ids.js';
import type { Env, Runner } from '../process.js';
import type { Profile } from '../profile.js';
import { readProjectFile } from '../project-file.js';
import { findProject } from '../projects.js';
import type { RegistryEntry } from '../registry.js';
import { MesaError, toFail } from '../result.js';
import { ending, type SessionRecord, type SessionStore, windowOf, windowSession } from './store.js';
import { killIfThere, type TmuxBackend } from './tmux.js';
import { addWorktree, removeWorktree, type Worktree, worktreePath } from './worktree.js';

export type OpenDeps = {
  profile: Profile;
  /** For MESA_PROFILE: a Profile knows its paths, not its name. */
  profileName: string;
  store: SessionStore;
  tmux: Pick<TmuxBackend, 'openWindow'>;
  run: Runner;
  clock: Clock;
  newUuid: IdSource;
  /** For MESA_SESSION_ID and MESA_PROFILE: a window's session is the default parent. */
  env: Env;
};

/**
 * The parent a new session gets: `parent` when given (not_found if it is not a session here),
 * none with `noParent`, else the session whose window this runs in (windowSession).
 */
function parentOf(
  deps: Pick<OpenDeps, 'store' | 'env' | 'profileName'>,
  input: { parent?: string; noParent?: boolean },
): string | undefined {
  if (input.noParent && input.parent !== undefined) {
    throw new MesaError('usage', 'pass --parent or --no-parent, not both');
  }
  if (input.parent !== undefined) {
    if (!deps.store.find(input.parent)) {
      throw new MesaError(
        'not_found',
        `no session ${input.parent} to be the parent; see mesa sessions, or pass --no-parent`,
      );
    }
    return input.parent;
  }
  return input.noParent ? undefined : windowSession(deps)?.id;
}

// ponytail: one tmux command holds about 16 KiB (measured: 15000 bytes went through, 17000 was
// "command too long"), so Mesa caps the agent's command below that, leaving room for the cwd and
// the variables. Past that, type the goal in with send-keys after the start.
const MAX_COMMAND_BYTES = 12_000;

// Strict, and a leading BOM dropped, so a file saved with one still starts `/goal`.
const decoder = new TextDecoder('utf-8', { fatal: true });

/** A goal file's text: UTF-8, its BOM dropped, otherwise unchanged. */
function readGoalFile(file: string): string {
  let bytes: Buffer;
  try {
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      throw new MesaError('not_found', `no goal file at ${file}`);
    }
    bytes = readFileSync(file);
  } catch (error) {
    if (error instanceof MesaError) throw error;
    const code = (error as NodeJS.ErrnoException).code ?? String(error);
    throw new MesaError('usage', `cannot read the goal file ${file}: ${code}`);
  }
  try {
    return decoder.decode(bytes);
  } catch {
    throw new MesaError('usage', `the goal file ${file} is not UTF-8 text`);
  }
}

/**
 * The goal from `--goal` or `--goal-file` (an absolute path), checked so claude takes it whole as
 * its first prompt. Undefined without either.
 */
export function readGoal(input: { goal?: string; goalFile?: string }): string | undefined {
  if (input.goal !== undefined && input.goalFile !== undefined) {
    throw new MesaError('usage', 'pass --goal or --goal-file, not both');
  }
  const goal = input.goalFile === undefined ? input.goal : readGoalFile(input.goalFile);
  if (goal === undefined) return undefined;
  if (!goal.trim()) throw new MesaError('usage', 'the goal is empty');
  if (goal.startsWith('-')) {
    throw new MesaError('usage', 'a goal cannot start with -: claude would read it as a flag');
  }
  // A process argument cannot hold one.
  if (goal.includes('\0')) throw new MesaError('usage', 'the goal holds a NUL byte');
  return goal;
}

/** What `mesa open` asks for, the goal already read (readGoal). */
export type OpenInput = {
  project: string;
  agent?: string;
  goal?: string;
  parent?: string;
  noParent?: boolean;
  /** Its own git worktree on this branch (CONTEXT.md, Worktree), started from `base` if new. */
  branch?: string;
  base?: string;
};

/**
 * Starts an agent for a registered project in a new window of the project's tmux session, with
 * `goal` as its first prompt, and with `branch`, in its own git worktree. The record is written
 * first, with the agent session id Mesa chose (docs/spikes/session-ids.md), and removed again,
 * with the worktree, if the window cannot open.
 */
export async function openSession(deps: OpenDeps, input: OpenInput): Promise<SessionRecord> {
  if (input.base !== undefined && input.branch === undefined) {
    throw new MesaError('usage', '--base needs --branch');
  }
  const parent = parentOf(deps, input);
  const entry = findProject(deps.profile, input.project);
  // Read even when --agent is given: a folder that is gone is not_found, never a claude in $HOME.
  const project = readProjectFile(entry.path);
  const name = input.agent ?? project.agent ?? deps.profile.config.defaultAgent;
  const parsed = AgentSchema.safeParse(name);
  if (!parsed.success) {
    const known = AGENT_NAMES.join(', ');
    throw new MesaError('agent_unavailable', `unknown agent ${name}; agents are ${known}`);
  }
  const agent = parsed.data;
  const spec = AGENTS[agent];
  if (!('start' in spec)) throw new MesaError('agent_unavailable', spec.planned);
  const check = await checkAgent(deps.run, agent);
  if (!check.ok) throw new MesaError('agent_unavailable', `${agent} ${check.hint}`);

  const agentSessionId = deps.newUuid();
  const command = spec.start(agentSessionId, input.goal);
  const bytes = Buffer.byteLength(command);
  if (bytes > MAX_COMMAND_BYTES) {
    throw new MesaError(
      'usage',
      `the goal makes a ${bytes}-byte command, over the ${MAX_COMMAND_BYTES} Mesa passes to tmux: shorten it, or keep the long part in a file the goal names`,
    );
  }
  const worktree =
    input.branch === undefined
      ? undefined
      : await worktreeFor(deps, entry, input.branch, input.base);
  try {
    return await startWindow(deps, {
      project: entry,
      agent,
      agentSessionId,
      command,
      goal: input.goal,
      parent,
      worktree,
    });
  } catch (error) {
    // A retry can then add it again.
    if (worktree) await removeWorktree(deps.run, entry.path, worktree);
    throw error;
  }
}

/** The session a worktree is: the newest with it, as a resume keeps it. */
const worktreeHolder = (store: SessionStore, path: string) =>
  store
    .list()
    .filter((r) => r.worktree?.path === path)
    .at(-1);

/** A new worktree on `branch`, unless a session has the worktree there. */
function worktreeFor(deps: OpenDeps, entry: RegistryEntry, branch: string, base?: string) {
  const root = join(deps.profile.paths.worktrees, entry.name);
  const path = worktreePath(root, branch);
  const holder = worktreeHolder(deps.store, path);
  if (holder?.worktree && existsSync(path)) {
    throw new MesaError(
      'usage',
      `session ${holder.id} has ${holder.worktree.branch}'s worktree at ${path}: use that session, or pick another branch`,
    );
  }
  return addWorktree(deps.run, { repo: entry.path, root, branch, base });
}

/**
 * Reopens a session's agent conversation (`claude --resume`) in a new window, as a new record
 * linked both ways: `resumedFrom` on the new one, `resumedBy` and `endedAt` on the old one. A
 * dead window the old session left is removed first; a live one refuses.
 */
export async function resumeSession(
  deps: OpenDeps & { tmux: Pick<TmuxBackend, 'openWindow' | 'findWindow' | 'killWindow'> },
  id: string,
): Promise<{ record: SessionRecord; from: SessionRecord; warning?: string }> {
  const old = deps.store.get(id);
  if (!old.agentSessionId) {
    throw new MesaError(
      'not_found',
      `session ${id} has no agent session id to resume; start a new one with mesa open ${old.project}`,
    );
  }
  // Its record says so, or, when writing that failed, the record resuming it does.
  const resumedBy = old.resumedBy ?? deps.store.list().find((r) => r.resumedFrom === id)?.id;
  if (resumedBy) {
    throw new MesaError(
      'usage',
      `session ${id} was already resumed as ${resumedBy}; mesa resume ${resumedBy}`,
    );
  }
  const spec = AGENTS[old.agent];
  if (!('resume' in spec)) throw new MesaError('agent_unavailable', spec.planned);
  const check = await checkAgent(deps.run, old.agent);
  if (!check.ok) throw new MesaError('agent_unavailable', `${old.agent} ${check.hint}`);
  const project = findProject(deps.profile, old.project);
  // tmux would start a window whose folder is gone in $HOME, where claude has no such conversation.
  const folder = folderOf(old, project);
  if (!existsSync(folder)) {
    throw new MesaError(
      'not_found',
      `session ${id}'s folder ${folder} is gone, and claude finds its conversation only there`,
    );
  }
  if (old.worktree) {
    const { path } = old.worktree;
    const holder = worktreeHolder(deps.store, path);
    if (holder && holder.id !== old.id) {
      throw new MesaError(
        'usage',
        `the worktree at ${path} is session ${holder.id}'s now: two sessions never share one`,
      );
    }
  }
  const target = windowOf(old);
  const left = await deps.tmux.findWindow(target);
  if (left && !left.dead) {
    throw new MesaError(
      'usage',
      `session ${id} is still running; mesa attach ${id}, or mesa stop ${id} first`,
    );
  }
  if (left) await killIfThere(deps.tmux, target);
  const record = await startWindow(deps, {
    project,
    agent: old.agent,
    agentSessionId: old.agentSessionId,
    // The same conversation, so the same goal; it is not typed in again.
    command: spec.resume(old.agentSessionId),
    goal: old.goal,
    // Its place in the tree too, and its folder: claude finds the conversation by its cwd.
    parent: old.parent,
    worktree: old.worktree,
    cwd: old.cwd,
    name: old.name,
    adopted: old.adopted,
    resumedFrom: old.id,
  });
  // The new session runs now, so marking the old one is best effort: a failure is a warning,
  // never a failed resume that a retry would open twice.
  const at = deps.clock().toISOString();
  try {
    const from = deps.store.update(old.id, (current) => ({
      resumedBy: record.id,
      ...ending(current, at),
    }));
    return { record, from };
  } catch (error) {
    const why = toFail(error).error.message;
    return { record, from: old, warning: `session ${id} not marked resumed: ${why}` };
  }
}

/** Where a session's agent runs: its own folder, else its worktree, else the project's. */
const folderOf = (r: Pick<SessionRecord, 'cwd' | 'worktree'>, project: RegistryEntry) =>
  r.cwd ?? r.worktree?.path ?? project.path;

/** What a new record holds before its window opens. */
export type NewWindow = {
  project: RegistryEntry;
  agent: Agent;
  agentSessionId: string;
  goal?: string;
  parent?: string;
  worktree?: Worktree;
  cwd?: string;
  name?: string;
  adopted?: true;
  resumedFrom?: string;
};

/** Writes the record, then opens its window; a window that cannot open removes the record again. */
export async function startWindow(
  deps: OpenDeps,
  s: NewWindow & { command: string },
): Promise<SessionRecord> {
  const record = createRecord(deps, s);
  try {
    await deps.tmux.openWindow({
      project: s.project.name,
      window: record.tmux.window,
      // claude keys its transcripts by cwd.
      cwd: folderOf(s, s.project),
      command: s.command,
      env: { MESA_SESSION_ID: record.id, MESA_PROFILE: deps.profileName },
    });
  } catch (error) {
    deps.store.remove(record.id);
    throw error;
  }
  return record;
}

/** A session's record, named for the window it gets (startWindow, or a later resume). */
export function createRecord(deps: Pick<OpenDeps, 'store' | 'clock' | 'profile'>, s: NewWindow) {
  const now = deps.clock().toISOString();
  return deps.store.create((id) => ({
    kind: 'interactive',
    project: s.project.name,
    agent: s.agent,
    agentSessionId: s.agentSessionId,
    ...(s.goal === undefined ? {} : { goal: s.goal }),
    ...(s.parent === undefined ? {} : { parent: s.parent }),
    ...(s.worktree === undefined ? {} : { worktree: s.worktree }),
    ...(s.cwd === undefined ? {} : { cwd: s.cwd }),
    ...(s.name === undefined ? {} : { name: s.name }),
    ...(s.adopted ? { adopted: s.adopted } : {}),
    // Named after the Mesa id, which a resume never reuses, so windows never collide.
    tmux: {
      socket: deps.profile.paths.tmuxSocket,
      session: s.project.name,
      window: `${s.agent}-${id}`,
    },
    startedAt: now,
    // ponytail: a guess until Faro (#25) classifies it on the next look: a fresh claude waits at
    // its prompt, or at the trust dialog in a folder it has not seen, or works on its goal.
    lastState: { state: 'idle', confidence: 0.6, at: now, source: 'mesa' },
    ...(s.resumedFrom ? { resumedFrom: s.resumedFrom } : {}),
  }));
}
