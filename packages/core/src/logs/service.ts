import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import { projectOf } from '../projects/projects.js';
import { readRegistry } from '../projects/registry.js';
import { callerOf } from '../sessions/window/caller.js';
import { changeLogFiles, logFile, suggestedLogFiles } from './log-files.js';
import { projectModules } from './modules.js';
import { type ReadOptions, readLog } from './read.js';
import { requestLines } from './request.js';
import { sourceId } from './source-id.js';
import { logSources } from './sources.js';
import { teeArgv } from './tee.js';

/** The Logs panel's side of Mesa (CONTEXT.md, Logs panel): a project's log sources and their entries. */
export function logsService(ctx: MesaContext) {
  const deps = () => ({
    run: ctx.run,
    store: ctx.store,
    lock: ctx,
    now: ctx.clock,
    sessionLogs: ctx.paths.logs,
    serverLogs: ctx.paths.serverLogs,
    logFiles: (project: string) =>
      readRegistry(ctx.paths.registry).find((entry) => entry.name === project)?.logFiles ?? [],
  });
  /**
   * `project`, checked to be registered, else the project of the session whose window runs this
   * mesa, else the one the working folder is in; usage when there is none.
   */
  const projectEntry = (project?: string) => {
    const registry = readRegistry(ctx.paths.registry);
    const name =
      project ??
      callerOf({ store: ctx.store, env: ctx.env, profileName: ctx.profile }).session?.project ??
      projectOf(ctx.cwd, registry);
    if (!name) throw new MesaError('usage', 'name a project: mesa logs sources <project>');
    const entry = registry.find((each) => each.name === name);
    if (!entry) throw new MesaError('not_found', `no project named ${name}; see mesa projects`);
    return entry;
  };
  const projectNamed = (project?: string) => projectEntry(project).name;
  /**
   * Where `project`'s service `name` keeps its output (a JetBrains IDE's console, or `mesa logs
   * run`), its folder made unless `make` is false: the path, and the source it becomes.
   */
  const file = (name: string, project?: string, make = true) => {
    const path = logFile(ctx.paths.serverLogs, projectNamed(project), name);
    if (make) mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    return { path, source: sourceId('file', name) };
  };

  return {
    /** Every source `project`'s local servers print to (logSources). */
    sources: async (project?: string) => ({
      sources: await logSources(deps(), projectNamed(project)),
    }),
    /** A source's last entries (readLog); a `file:` source is the project's. */
    read: (source: string, opts: ReadOptions & { project?: string } = {}) =>
      readLog(deps(), source, { ...opts, project: () => projectNamed(opts.project) }),
    /** Every line of request `id` across all of `project`'s sources, in time order (requestLines). */
    request: async (id: string, project?: string) => {
      const name = projectNamed(project);
      const sources = await logSources(deps(), name);
      return requestLines(
        deps(),
        name,
        id,
        sources.map((source) => source.id),
      );
    },
    /**
     * The argv that runs `command` as it is, its output also appended to `project`'s log file
     * `name` (teeArgv), its folder made: what `mesa logs run` hands the terminal to.
     */
    run: (name: string, command: readonly string[], project?: string) => {
      if (!command.length) throw new MesaError('usage', 'name the command to run after --');
      const made = file(name, project);
      return { ...made, exec: teeArgv(made.path, command) };
    },
    /** The log files the project keeps anywhere, and the gitignored `*.log` files Mesa suggests. */
    files: async (project?: string) => {
      const entry = projectEntry(project);
      const files = entry.logFiles ?? [];
      return { files, suggested: await suggestedLogFiles(ctx.run, entry.path, files) };
    },
    /** Keeps `path` (a file) among the project's log files; its files after. */
    addFile: (path: string, project?: string) => ({
      files: changeLogFiles(
        ctx,
        ctx.paths.registry,
        projectNamed(project),
        ctx.absolute(path),
        true,
      ),
    }),
    /** Stops keeping `path` among the project's log files; the file stays. Its files after. */
    removeFile: (path: string, project?: string) => ({
      files: changeLogFiles(
        ctx,
        ctx.paths.registry,
        projectNamed(project),
        ctx.absolute(path),
        false,
      ),
    }),
    /** The project's modules (projectModules), the service names the IntelliJ steps offer. */
    modules: (project?: string) => ({ modules: projectModules(projectEntry(project).path) }),
    file,
  };
}
