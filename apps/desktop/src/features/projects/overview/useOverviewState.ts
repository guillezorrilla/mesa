import type { Agent, ProjectRow } from '@mesa/core';
import { DEFAULT_AGENT } from '@mesa/core/browser';
import { useEffect, useState } from 'react';

/** The Overview tab's view state, held by the project screen so it outlasts a tab switch. */
export type OverviewState = ReturnType<typeof useOverviewState>;

/** A goal the composer is filled in with, built from an imported item (Start session). */
export type ItemDraft = { from: string; title: string; goal: string };

/**
 * The composer's open state, where a session starts, the agent picked (back to the project's
 * own when that changes), the imported item it starts from, if any, the other projects it also
 * works in, and whether native history shows.
 */
export function useOverviewState(project: ProjectRow) {
  const [location, setLocation] = useState<'main' | 'worktree'>('main');
  const [composerOpen, setComposerOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState<ItemDraft>();
  // The other projects the next session also works in, kept with the project they were chosen
  // for, so another project starts with none.
  const [chosen, setChosen] = useState<{ project: string; names: string[] }>();
  const additional = chosen?.project === project.name ? chosen.names : [];
  const setAdditional = (names: string[]) => setChosen({ project: project.name, names });
  const [selectedAgent, setSelectedAgent] = useState<Agent>(
    (project.agent as Agent | undefined) ?? DEFAULT_AGENT,
  );
  useEffect(
    () => setSelectedAgent((project.agent as Agent | undefined) ?? DEFAULT_AGENT),
    [project.agent],
  );
  return {
    location,
    setLocation,
    composerOpen,
    setComposerOpen,
    historyOpen,
    setHistoryOpen,
    selectedAgent,
    setSelectedAgent,
    draft,
    setDraft,
    additional,
    setAdditional,
  };
}
