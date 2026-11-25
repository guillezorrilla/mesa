import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { projectOf } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { callerOf } from '../sessions/window/caller.js';
import { type ReadOptions, readLog } from './read.js';
import { sourceId } from './source-id.js';
import { logFile, logSources } from './sources.js';

/** The Logs panel's side of Mesa (CONTEXT.md, Logs panel): a project's log sources and their entries. */
export function logsService(ctx: MesaContext) {
  const deps = () => ({
    run: ctx.run,
    store: ctx.store,
    lock: ctx,
    now: ctx.clock,
    sessionLogs: ctx.paths.logs,
    serverLogs: ctx.paths.serverLogs,
  });
  /**
   * `project`, checked to be registered, else the project of the session whose window runs this
   * mesa, else the one the working folder is in; usage when there is none.
   */
  const projectNamed = (project?: string) => {
    const registry = readRegistry(ctx.paths.registry);
    const name =
      project ??
      callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session?.project ??
      projectOf(ctx.cwd, registry);
    if (!name) throw new MesaError('usage', 'name a project: mesa logs sources <project>');
    if (!registry.some((entry) => entry.name === name))
      throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
    return name;
  };
  return {
    /** Every source `project`'s local servers print to (logSources). */
    sources: async (project?: string) => ({
      sources: await logSources(deps(), projectNamed(project)),
    }),
    /** A source's last entries (readLog); a `file:` source is the project's. */
    read: (source: string, opts: ReadOptions & { project?: string } = {}) =>
      readLog(deps(), source, { ...opts, project: () => projectNamed(opts.project) }),
    /**
     * Where an IDE saves `project`'s service `name` console (the IntelliJ setup), its folder made
     * unless `make` is false: the path, and the source it becomes once the file is there.
     */
    file: (name: string, project?: string, make = true) => {
      const path = logFile(ctx.paths.serverLogs, projectNamed(project), name);
      if (make) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
      return { path, source: sourceId('file', name) };
    },
  };
}
