import type { Config, ProjectRow, TreeRow } from '@mesa/core';
import { activeSession, recoverable } from '@mesa/core/browser';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { WorkspaceView } from '@/lib/workspaceView';

/**
 * Opens the first view once, while the Board is still showing: onboarding with no profile or
 * while it is active, else the first live or recoverable session. Returns whether the first view
 * is chosen (`ready`, also once a read it needs failed), whether onboarding is the view, and the
 * callback for the session tree's first answer; layout effects switch the view before that frame
 * paints.
 */
export function useInitialView(props: {
  config: Config | undefined;
  needsProfileSetup: boolean;
  projects: readonly ProjectRow[] | undefined;
  sessions: readonly TreeRow[];
  /** `config.get` (other than `not_found`) or `projects.list` failed. */
  failed: boolean;
  setView: Dispatch<SetStateAction<WorkspaceView>>;
}) {
  const { config, needsProfileSetup, projects, sessions, setView } = props;
  const openedFirstView = useRef(false);
  const openedInitialSession = useRef(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const onSessionsLoaded = useCallback(() => setSessionsLoaded(true), []);
  useLayoutEffect(() => {
    if ((!config && !needsProfileSetup) || openedFirstView.current) return;
    openedFirstView.current = true;
    if (needsProfileSetup || config?.onboarding?.status === 'active')
      setView((current) => (current.kind === 'sessions' ? { kind: 'onboarding' } : current));
  }, [config, needsProfileSetup, setView]);
  useLayoutEffect(() => {
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
  const onboarding = needsProfileSetup || config?.onboarding?.status === 'active';
  const ready = props.failed || onboarding || (!!config && !!projects && sessionsLoaded);
  return { ready, onboarding, onSessionsLoaded };
}
