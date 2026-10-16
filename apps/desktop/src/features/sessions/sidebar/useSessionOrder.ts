import type { ProjectRow } from '@mesa/core';
import { useRef, useState } from 'react';
import { useToast, warningOf } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';

// ponytail: one save per pause, so a held Option+Arrow writes the registry once.
/** How long after the last move its project's order saves, in milliseconds. */
export const SAVE_DELAY_MS = 300;

/**
 * The projects with each one's session order as last moved here, shown at once and saved after a
 * pause (mesa projects update --session-order), one save at a time so the last move is the one
 * kept. Once a save lands and the projects read back, or it fails (to the toast), its project
 * shows the saved order again; a later move stays shown. A save's warning shows as an alert.
 */
export function useSessionOrder(projects: readonly ProjectRow[], refresh: () => unknown) {
  const [moved, setMoved] = useState<Record<string, string[]>>({});
  const run = useRun();
  const toast = useToast();
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const save = async (project: string, ids: string[]) => {
    const saved = await run('projects.update', { name: project, sessionOrder: ids });
    const warning = warningOf(saved);
    if (warning) toast(warning.text, warning.tone);
    if (saved) await refresh();
    setMoved((current) => {
      if (current[project] !== ids) return current;
      const { [project]: _shown, ...rest } = current;
      return rest;
    });
  };
  const reorder = (project: string, ids: string[]) => {
    setMoved((current) => ({ ...current, [project]: ids }));
    clearTimeout(timers.current.get(project));
    timers.current.set(
      project,
      setTimeout(() => {
        saving.current = saving.current.then(() => save(project, ids));
      }, SAVE_DELAY_MS),
    );
  };
  const shown = projects.map((project) => {
    const ids = moved[project.name];
    return ids ? { ...project, sessionOrder: ids } : project;
  });
  return { projects: shown, reorder };
}
