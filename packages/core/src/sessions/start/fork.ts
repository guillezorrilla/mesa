import { existsSync } from 'node:fs';
import { AGENTS } from '../../agents/agents.js';
import { supportsAgentCapability } from '../../agents/names.js';
import { readyAgent } from '../../doctor/probe.js';
import { gitCommand } from '../../git/command.js';
import { MesaError } from '../../lib/result.js';
import { findProject } from '../../projects/projects.js';
import { GENERAL_PROJECT } from '../record/general.js';
import { type AdditionalStart, additionalDirs, additionalProjects } from './additional.js';
import { folderOf, type LaunchDeps, launchSession } from './launch.js';

/**
 * Start a new native conversation from an existing one, leaving its source untouched. A source
 * across several projects (CONTEXT.md, Additional project) forks only with `branch`: every project
 * gets a worktree on it, each new branch from that project's source worktree HEAD.
 */
export async function forkSession(
  deps: LaunchDeps,
  id: string,
  opts: { branch?: string; base?: string } = {},
) {
  const source = deps.store.get(id);
  const agent = source.agent;
  if (
    source.kind !== 'interactive' ||
    source.background ||
    agent === 'terminal' ||
    !supportsAgentCapability(agent, 'fork')
  ) {
    throw new MesaError('usage', `session ${id} has no qualified native fork`);
  }
  const nativeId = source.agentSessionId;
  if (!nativeId) {
    throw new MesaError('not_found', `session ${id} has no native conversation ID to fork`);
  }
  if (source.additional && !opts.branch)
    throw new MesaError(
      'usage',
      `session ${id} works in several projects: pass --branch so its fork gets worktrees of its own`,
    );
  if (opts.base && !opts.branch) throw new MesaError('usage', '--base needs --branch');
  if (opts.branch && source.project === GENERAL_PROJECT) {
    throw new MesaError('usage', 'General sessions cannot use a worktree');
  }
  const project =
    source.project === GENERAL_PROJECT ? null : findProject(deps.profile, source.project);
  const folder = folderOf(source, project);
  if (!existsSync(folder)) {
    throw new MesaError('not_found', `session ${id}'s folder ${folder} is gone`);
  }
  await readyAgent(deps.run, agent);
  const native = AGENTS[agent];
  if (!('fork' in native)) throw new MesaError('internal', `${agent} has no native fork command`);
  const { branch } = opts;
  /** Where `branch` starts in `repo`: --base, else HEAD of the source's checkout `from` there. */
  const startOf = async (repo: string, from: string) =>
    branch && opts.base === undefined ? headBase(deps, repo, from, branch) : opts.base;
  const base = project ? await startOf(project.path, folder) : opts.base;
  // Every other project is checked before any git write (additional.ts).
  const others = source.additional ?? [];
  const entries = project
    ? await additionalProjects(
        deps,
        project,
        others.map((a) => a.project),
      )
    : [];
  const additional: AdditionalStart[] = [];
  for (const [i, entry] of entries.entries())
    additional.push({ entry, base: await startOf(entry.path, others[i]?.worktree.path ?? '') });
  return launchSession(
    deps,
    {
      project,
      agent,
      mode: source.mode,
      goal: source.goal,
      parent: source.id,
      ...(!branch ? { cwd: folder } : {}),
    },
    {
      command: (record) =>
        native.fork(
          nativeId,
          folderOf(record, project),
          deps.mounts,
          deps.profile.config.agents,
          source.mode,
          additionalDirs(record),
        ),
      branch,
      base,
      ...(additional.length ? { additional } : {}),
    },
  );
}

/**
 * Where a fork's new branch in `repo` starts: `folder`'s HEAD, the source's checkout there, or
 * none when `repo` has the branch already, which is reused as it is.
 */
async function headBase(deps: LaunchDeps, repo: string, folder: string, branch: string) {
  const existing = await gitCommand(deps.run, repo, [
    'show-ref',
    '--verify',
    `refs/heads/${branch}`,
  ]);
  if (existing.ok) return undefined;
  const head = await gitCommand(deps.run, folder, ['rev-parse', 'HEAD']);
  if (!head.ok) throw new MesaError('usage', `cannot fork from ${folder}: ${head.detail}`);
  return head.stdout.trim();
}
