import type { Config, ProjectRow, TreeRow } from '@mesa/core';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';
import { activeSession, recoverable } from '@/features/sessions/rows';
import type { WorkspaceView } from '../navigation';

/**
 * Opens the first view once, while the Board is still showing: the tour while onboarding is
 * active, else the first live or recoverable session. `skipTour` keeps the tour closed (a profile
 * just made from Add project).
 */
export function useInitialView(props: {
  config: Config | undefined;
  projects: readonly ProjectRow[] | undefined;
  sessions: readonly TreeRow[];
  setView: Dispatch<SetStateAction<WorkspaceView>>;
}) {
  const { config, projects, sessions, setView } = props;
  const openedInitialTour = useRef(false);
  const openedInitialSession = useRef(false);
  useEffect(() => {
    if (!config || openedInitialTour.current) return;
    openedInitialTour.current = true;
    if (config.onboarding?.status === 'active')
      setView((current) => (current.kind === 'sessions' ? { kind: 'tour' } : current));
  }, [config, setView]);
  useEffect(() => {
    if (
      config?.onboarding?.status === 'active' ||
      openedInitialSession.current ||
      !projects ||
      sessions.length === 0
    )
      return;
    const first = sessions.find((session) => activeSession(session) || recoverable(session));
    if (!first) return;
    openedInitialSession.current = true;
    setView((current) =>
      current.kind === 'sessions' ? { kind: 'session', id: first.id } : current,
    );
  }, [projects, sessions, config?.onboarding?.status, setView]);
  return {
    skipTour: () => {
      openedInitialTour.current = true;
    },
  };
}
