import type { Config, ProjectRow, TreeRow } from '@mesa/core';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';
import { activeSession, recoverable } from '@/features/sessions/rows';
import type { WorkspaceView } from '../navigation';

/**
 * Opens the first view once, while the Board is still showing: Set up with no profile, the tour
 * while onboarding is active, else the first live or recoverable session.
 */
export function useInitialView(props: {
  config: Config | undefined;
  needsProfileSetup: boolean;
  projects: readonly ProjectRow[] | undefined;
  sessions: readonly TreeRow[];
  setView: Dispatch<SetStateAction<WorkspaceView>>;
}) {
  const { config, needsProfileSetup, projects, sessions, setView } = props;
  const openedFirstView = useRef(false);
  const openedInitialSession = useRef(false);
  useEffect(() => {
    if ((!config && !needsProfileSetup) || openedFirstView.current) return;
    openedFirstView.current = true;
    const first = needsProfileSetup
      ? 'setup'
      : config?.onboarding?.status === 'active'
        ? 'tour'
        : undefined;
    if (first) setView((current) => (current.kind === 'sessions' ? { kind: first } : current));
  }, [config, needsProfileSetup, setView]);
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
}
