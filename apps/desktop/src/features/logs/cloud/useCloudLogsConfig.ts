import type { CloudView } from '@mesa/core';
import { useToast } from '@/components/Toast';
import type { CloudFilters } from '@/lib/client/logs';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall, useCommand, useRun } from '@/lib/useCommand';

/**
 * The Logs tab's side of the profile config (CONTEXT.md, Cloud Logs), the one place its components
 * change it: the projects and envs, the stars, the saved views (save, remove, export and import as
 * YAML), and the project a service's Fix in session starts in. Each change is read again by every reader.
 */
export function useCloudLogsConfig() {
  const config = useCommand('config.get');
  const run = useRun();
  const call = useCall();
  const toast = useToast();
  const { pickFolder, pickFile } = usePlatform();
  const logs = config.data?.logs;
  const set = async (path: string, value: unknown) => {
    const done = await run('config.set', { path, value });
    await config.refreshEverywhere();
    return Boolean(done);
  };
  const views: CloudView[] = logs?.views ?? [];
  return {
    loaded: Boolean(config.data),
    logs,
    gcp: logs?.gcp,
    views,
    refresh: config.refreshEverywhere,
    /** Saves `filters` as view `name`, leaving out the moment's range, trace and noise switch. */
    saveView: (name: string, filters: CloudFilters) => {
      const { since: _, trace: __, all: ___, ...kept } = filters;
      return set('logs.views', [...views.filter((v) => v.name !== name), { name, ...kept }]);
    },
    removeView: (name: string) =>
      set(
        'logs.views',
        views.filter((v) => v.name !== name),
      ),
    /** Writes the views to a YAML file in a folder the person picks, to share them. */
    exportViews: async () => {
      const folder = await pickFolder();
      if (!folder) return;
      const done = await run('logs.viewsExport', { file: `${folder}/mesa-log-views.yaml` });
      if (done) toast(`Wrote ${done.views} views to ${done.file}`);
    },
    /** Adds the views a YAML file the person picks holds; one of a kept name replaces it. */
    importViews: async () => {
      const file = await pickFile();
      if (!file) return;
      const done = await run('logs.viewsImport', { file });
      if (!done) return;
      toast(`Imported ${done.views.length} views`);
      await config.refreshEverywhere();
    },
    /**
     * Imports each project's log-based metrics as saved views (logs.importMetrics), one after
     * another; a project whose import fails toasts why. How many views came.
     */
    importMetrics: async (projects: readonly string[]) => {
      let added = 0;
      for (const project of projects) {
        const done = await call('logs.importMetrics', { project });
        if (done.ok) added += done.data.views.length;
        else toast(`Saved views from ${project}'s metrics: ${done.error.message}`);
      }
      await config.refreshEverywhere();
      return added;
    },
    /** Points Cloud Logs at `projects` with `envs` (logs.gcpSetup); true once saved. */
    setup: async (projects: string[], envs: Record<string, string>) => {
      const saved = await run('logs.gcpSetup', { projects, envs });
      if (saved) await config.refreshEverywhere();
      return Boolean(saved);
    },
    /** Stars a project in the switcher, shown at once and undone if it fails. */
    star: async (project: string, on: boolean) => {
      config.mutate((data) => ({
        ...data,
        logs: {
          ...data.logs,
          starredProjects: on
            ? [...data.logs.starredProjects, project]
            : data.logs.starredProjects.filter((p) => p !== project),
        },
      }));
      if (!(await run('logs.star', { project, on }))) await config.refresh();
    },
    fixProjects: logs?.fixProjects ?? {},
    rememberFix: (ref: string, project: string) =>
      set('logs.fixProjects', { ...(logs?.fixProjects ?? {}), [ref]: project }),
  };
}
