import type { ProjectRow } from '@mesa/core';
import { withSessionOrder } from '@mesa/core/browser';
import { useRef } from 'react';
import { useToast, warningOf } from '@/components/Toast';
import { type CommandState, useRun } from '@/lib/useCommand';

// ponytail: one save per pause, so a held Option+Arrow writes the registry once.
/** How long after the last move its project's order saves, in milliseconds. */
export const SAVE_DELAY_MS = 300;

/** The read of the projects the sidebar shows. */
type ProjectsRead = Pick<CommandState<ProjectRow[]>, 'mutate' | 'refresh'>;

/**
 * Reorders a project's session cards: the order shows at once in `read`, the projects the sidebar
 * shows, then saves after a pause (mesa projects update --session-order), one save at a time, so
 * the last move is the order kept. A failed save goes to the toast and `read` loads again, back to
 * the saved order; a save's warning is an alert.
 */
export function useReorderSessions(read: ProjectsRead) {
  const run = useRun();
  const toast = useToast();
  const pending = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saving = useRef<Promise<unknown>>(Promise.resolve());
  const save = async (project: string, ids: string[]) => {
    const saved = await run('projects.update', { name: project, sessionOrder: ids });
    const warning = warningOf(saved);
    if (warning) toast(warning.text, warning.tone);
    if (!saved) await read.refresh();
  };
  return (project: string, ids: string[]) => {
    read.mutate((rows) => withSessionOrder(rows, project, ids));
    clearTimeout(pending.current.get(project));
    pending.current.set(
      project,
      setTimeout(() => {
        saving.current = saving.current.then(() => save(project, ids));
      }, SAVE_DELAY_MS),
    );
  };
}
