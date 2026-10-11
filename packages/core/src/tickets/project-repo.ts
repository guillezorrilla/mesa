import type { MesaContext } from '../context.js';
import { gitCommand } from '../git/command.js';
import { findProject } from '../projects/projects.js';
import { repoOfRemote } from '../sources/github.js';

/** The repo (owner/repo) of `project`'s origin remote on github.com; none without one. */
export async function originRepo(ctx: MesaContext, project: string): Promise<string | undefined> {
  const { path } = findProject(ctx.open(), project);
  const remote = await gitCommand(ctx.run, path, ['remote', 'get-url', 'origin']);
  return remote.ok ? repoOfRemote(remote.stdout) : undefined;
}
