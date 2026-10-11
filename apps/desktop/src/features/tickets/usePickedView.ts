import { useState } from 'react';

// ponytail: kept in this machine's localStorage, a convenience; another device starts on all views.
const keyOf = (project: string) => `mesa.tickets.view.${project}`;

/** The view picked last in `project`'s Tickets tab, or undefined (all views) if none or unreadable. */
const stored = (project: string) => {
  try {
    return localStorage.getItem(keyOf(project)) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * The view picked in `project`'s Tickets tab and its setter, kept across visits: leaving the
 * project and coming back shows the same view, not all of them again.
 */
export function usePickedView(project: string) {
  const [picked, setPicked] = useState(() => ({ project, view: stored(project) }));
  const view = picked.project === project ? picked.view : stored(project);
  const setView = (next: string | undefined) => {
    setPicked({ project, view: next });
    try {
      if (next === undefined) localStorage.removeItem(keyOf(project));
      else localStorage.setItem(keyOf(project), next);
    } catch {
      // Storage refused (a private window, say): the pick still holds until the tab closes.
    }
  };
  return [view, setView] as const;
}
