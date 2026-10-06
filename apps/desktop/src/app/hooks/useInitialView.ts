import type { Config, ProjectRow, TreeRow } from '@mesa/core';
import { activeSession, recoverable } from '@mesa/core/browser';
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react';
import type { WorkspaceView } from '../navigation';

/**
 * Opens the first view once, while the Board is still showing: onboarding with no profile or
 * while it is active, else the first live or recoverable session.
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
    if (needsProfileSetup || config?.onboarding?.status === 'active')
      setView((current) => (current.kind === 'sessions' ? { kind: 'onboarding' } : current));
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
