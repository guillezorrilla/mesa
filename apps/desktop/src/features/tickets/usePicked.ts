import { useState } from 'react';

/** What a project's Tickets tab keeps picked across visits: the view, and the ticket open. */
type Kept = 'view' | 'ticket';

// ponytail: kept in this machine's localStorage, a convenience; another device starts fresh.
const keyOf = (project: string, kept: Kept) => `mesa.tickets.${kept}.${project}`;

/** The `kept` pick last made in `project`'s Tickets tab, or undefined if none or unreadable. */
const stored = (project: string, kept: Kept) => {
  try {
    return localStorage.getItem(keyOf(project, kept)) ?? undefined;
  } catch {
    return undefined;
  }
};

/**
 * A pick in `project`'s Tickets tab and its setter, kept across visits: leaving the project or
 * the tab and coming back shows the same view and the same ticket, not the defaults again.
 */
export function usePicked(project: string, kept: Kept) {
  const [picked, setPicked] = useState(() => ({ project, value: stored(project, kept) }));
  const value = picked.project === project ? picked.value : stored(project, kept);
  const setValue = (next: string | undefined) => {
    setPicked({ project, value: next });
    try {
      if (next === undefined) localStorage.removeItem(keyOf(project, kept));
      else localStorage.setItem(keyOf(project, kept), next);
    } catch {
      // Storage refused (a private window, say): the pick still holds until the tab closes.
    }
  };
  return [value, setValue] as const;
}
