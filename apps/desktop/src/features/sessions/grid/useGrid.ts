import type { GridGroup } from '@mesa/core';
import { useState } from 'react';
import { warningOf } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';
import type { TerminalPanels } from '../terminals/useTerminalPanels';
import type { SessionAct } from '../useSessionAct';

/**
 * The Grid over the open terminal panels: its project tab, adding a project's live sessions, and
 * saving, opening, and removing its Grid groups.
 */
export function useGrid({
  panels,
  act,
  onGroupsChanged,
}: {
  panels: TerminalPanels;
  act: SessionAct;
  onGroupsChanged?: () => void;
}) {
  const run = useRun();
  const [project, setProject] = useState('all');
  const [notice, setNotice] = useState('');
  const { liveRows, live, setPanels, setZoomed } = panels;
  const saveGroup = (name: string) =>
    act(async () => {
      const sessions = panels.panels.filter((id) =>
        liveRows.some((row) => row.id === id && (project === 'all' || row.project === project)),
      );
      const saved = await run('grid.save', {
        name,
        project: project === 'all' ? undefined : project,
        sessions,
      });
      if (!saved) return undefined;
      onGroupsChanged?.();
      return warningOf(saved);
    });
  const removeGroup = (name: string) =>
    act(async () => {
      const removed = await run('grid.remove', { name });
      if (!removed) return undefined;
      onGroupsChanged?.();
      return warningOf(removed);
    });
  const openGroup = (group: GridGroup) => {
    const available = group.sessions.filter((id) => live.has(id));
    setProject(group.project ?? 'all');
    setPanels(available);
    setZoomed(undefined);
    setNotice(
      group.sessions.length === available.length
        ? ''
        : `${group.sessions.length - available.length} saved session(s) are unavailable; the group was kept.`,
    );
  };
  return {
    project,
    notice,
    chooseProject: (next: string) => {
      setProject(next);
      setZoomed(undefined);
    },
    addProject: () =>
      setPanels((open) => [
        ...new Set([
          ...open,
          ...liveRows
            .filter((row) => project === 'all' || row.project === project)
            .map((row) => row.id),
        ]),
      ]),
    saveGroup,
    removeGroup,
    openGroup,
  };
}
