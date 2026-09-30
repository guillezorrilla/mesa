import { existsSync } from 'node:fs';
import { AGENTS, readyAgent } from '../agents/agents.js';
import { supportsAgentCapability } from '../agents/names.js';
import { gitCommand } from '../git/command.js';
import { MesaError } from '../lib/result.js';
import { findProject } from '../projects/projects.js';
import { GENERAL_PROJECT } from './general.js';
import { folderOf, type LaunchDeps, launchSession } from './launch.js';

/** Start a new native conversation from an existing one, leaving its source untouched. */
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
  let base = opts.base;
  if (opts.branch && !base && project) {
    const existing = await gitCommand(deps.run, project.path, [
      'show-ref',
      '--verify',
      `refs/heads/${opts.branch}`,
    ]);
    if (!existing.ok) {
      const head = await gitCommand(deps.run, folder, ['rev-parse', 'HEAD']);
      if (!head.ok) throw new MesaError('usage', `cannot fork from ${folder}: ${head.detail}`);
      base = head.stdout.trim();
    }
  }
  return launchSession(
    deps,
    {
      project,
      agent,
      mode: source.mode,
      goal: source.goal,
      parent: source.id,
      ...(!opts.branch ? { cwd: folder } : {}),
    },
    {
      command: (record) =>
        native.fork(nativeId, folderOf(record, project), deps.vaultServer, source.mode),
      branch: opts.branch,
      base,
    },
  );
}
