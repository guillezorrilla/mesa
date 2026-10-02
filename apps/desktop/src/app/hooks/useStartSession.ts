import type { ProjectRow, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT } from '@mesa/core/browser';
import { useCallback, useState } from 'react';
import { useToast, warned } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import type { WorkspaceView } from '../navigation';

/** Where a new session runs: the project's main checkout, a new worktree, or a plain terminal. */
export type SessionLocation = 'main' | 'worktree' | 'terminal';

/** What a new session starts from: by default the project in view, on its main checkout. */
export type SessionPreset = {
  project?: string;
  general?: boolean;
  location?: SessionLocation;
  parent?: string;
  /** An existing linked worktree to run in. */
  checkout?: string;
};

/**
 * `requestNewSession` starts a session at once, as Xirp does: no dialog, and no agent, so
 * `mesa open` takes the project's, else the profile default. With no project named, the one in
 * view, else the first that exists. Once it opens, it is shown through `navigateLatest`.
 * `starting` lists the sessions starting, by project (GENERAL_PROJECT for General): the sidebar
 * shows each until it opens.
 */
export function useStartSession(props: {
  view: WorkspaceView;
  sessions: readonly TreeRow[];
  projects: readonly ProjectRow[] | undefined;
  navigate: (view: WorkspaceView) => void;
  /** The latest navigate: files may have been edited while a session opened. */
  navigateLatest: (view: WorkspaceView) => void;
}) {
  const { view, sessions, projects, navigate, navigateLatest } = props;
  const run = useRun();
  const toast = useToast();
  const [starting, setStarting] = useState<string[]>([]);
  const requestNewSession = useCallback(
    async (preset: SessionPreset = {}) => {
      const inView =
        view.kind === 'project'
          ? view.name
          : view.kind === 'session'
            ? sessions.find((session) => session.id === view.id)?.project
            : undefined;
      const project = preset.general
        ? undefined
        : (preset.project ??
          (inView && inView !== GENERAL_PROJECT ? inView : undefined) ??
          projects?.find((entry) => entry.exists)?.name);
      if (!preset.general && !project) {
        navigate({ kind: 'sessions' });
        return;
      }
      const key = project ?? GENERAL_PROJECT;
      setStarting((current) => [...current, key]);
      try {
        const opened = await run('sessions.open', {
          ...(project ? { project } : { general: true }),
          parent: preset.parent,
          terminal: preset.location === 'terminal' || undefined,
          worktree: preset.location === 'worktree' || undefined,
          checkout: preset.checkout,
        });
        if (!opened) return;
        // No confirmation, as the session shows; a warning (hooks to trust) still says so.
        const warning = warned(opened.warning);
        if (warning) toast(warning.text, warning.tone);
        navigateLatest({ kind: 'session', id: opened.id });
      } finally {
        setStarting((current) => current.filter((_, i) => i !== current.indexOf(key)));
      }
    },
    [view, sessions, projects, run, navigate, navigateLatest, toast],
  );
  return { starting, requestNewSession };
}
