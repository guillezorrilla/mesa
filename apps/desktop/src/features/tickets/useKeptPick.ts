import { useState } from 'react';
import { readKept, writeKept } from '@/lib/keptValue';

/** What a project's Tickets tab keeps picked across visits: the view, and the ticket open. */
type KeptPick = 'view' | 'ticket';

const keyOf = (project: string, kept: KeptPick) => `mesa.tickets.${kept}.${project}`;

/**
 * A pick in `project`'s Tickets tab and its setter, kept across visits: leaving the project or
 * the tab and coming back shows the same view and the same ticket, not the defaults again.
 */
export function useKeptPick(project: string, kept: KeptPick) {
  const stored = () => readKept(keyOf(project, kept));
  const [picked, setPicked] = useState(() => ({ project, value: stored() }));
  const value = picked.project === project ? picked.value : stored();
  const setValue = (next: string | undefined) => {
    setPicked({ project, value: next });
    writeKept(keyOf(project, kept), next);
  };
  return [value, setValue] as const;
}
