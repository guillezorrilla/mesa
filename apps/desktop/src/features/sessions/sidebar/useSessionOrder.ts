import type { ProjectRow } from '@mesa/core';
import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';

const same = (a: readonly string[], b: readonly string[]) => a.join() === b.join();

/**
 * The projects with each one's session order as last moved here, shown at once while it saves
 * (mesa projects update --session-order) and until the projects read back with it; a failed save
 * goes to the toast and its project falls back to the saved order, and a saved one's warning (no
 * receipt) shows as an alert.
 */
export function useSessionOrder(projects: readonly ProjectRow[], onSaved: () => void) {
  const [moved, setMoved] = useState<Record<string, string[]>>({});
  const run = useRun();
  const toast = useToast();
  useEffect(() => {
    setMoved((current) => {
      const waiting = Object.entries(current).filter(
        ([name, ids]) => !same(projects.find((p) => p.name === name)?.sessionOrder ?? [], ids),
      );
      return waiting.length === Object.keys(current).length ? current : Object.fromEntries(waiting);
    });
  }, [projects]);
  const reorder = async (project: string, ids: string[]) => {
    setMoved((current) => ({ ...current, [project]: ids }));
    const saved = await run('projects.update', { name: project, sessionOrder: ids });
    if (saved) {
      if (saved.warning) toast(saved.warning);
      return onSaved();
    }
    // A later move of the same project wins over this failure.
    setMoved((current) => {
      if (current[project] !== ids) return current;
      const { [project]: _failed, ...rest } = current;
      return rest;
    });
  };
  const shown = projects.map((project) => {
    const ids = moved[project.name];
    return ids ? { ...project, sessionOrder: ids } : project;
  });
  return { projects: shown, reorder };
}
