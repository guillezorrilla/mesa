import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsCategory } from '@/features/settings/categories';
import type { Overlay, WorkspaceView } from './navigation';

/**
 * Where the workspace is: the view in the main pane, the overlay open over it, and the view held
 * back while the open project has unsaved file edits. `navigate` opens an overlay for the views
 * that are one, and asks before leaving a project with unsaved files.
 */
export function useWorkspaceNavigation() {
  const [view, setView] = useState<WorkspaceView>({ kind: 'sessions' });
  const [filesDirty, setFilesDirty] = useState(false);
  const [pendingView, setPendingView] = useState<WorkspaceView>();
  // The session and project last shown, so going back to one keeps it.
  const [lastSession, setLastSession] = useState<string>();
  const [lastProject, setLastProject] = useState<string>();
  useEffect(() => {
    if (view.kind === 'session') setLastSession(view.id);
    if (view.kind === 'project') setLastProject(view.name);
  }, [view]);
  const [overlay, setOverlay] = useState<Overlay>();
  const [settingsCategory, setSettingsCategory] = useState<SettingsCategory>();
  const navigate = useCallback(
    (next: WorkspaceView) => {
      if (next.kind === 'usage' || next.kind === 'inbox' || next.kind === 'shortcuts') {
        setOverlay(next.kind);
        return;
      }
      if (next.kind === 'preferences') {
        setSettingsCategory(undefined);
        setOverlay('settings');
        return;
      }
      setOverlay(undefined);
      if (
        filesDirty &&
        view.kind === 'project' &&
        (next.kind !== 'project' || next.name !== view.name)
      )
        setPendingView(next);
      else setView(next);
    },
    [filesDirty, view],
  );
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  /** Stable: always the latest `navigate`, for listeners and work that finishes later. */
  const navigateLatest = useCallback((next: WorkspaceView) => navigateRef.current(next), []);
  /** Opens Settings on `category`. */
  const openSettings = useCallback((category: SettingsCategory) => {
    setSettingsCategory(category);
    setOverlay('settings');
  }, []);
  /** Leaves the project for the held-back view, dropping its unsaved file edits. */
  const discardPending = () => {
    setFilesDirty(false);
    if (pendingView) setView(pendingView);
    setPendingView(undefined);
  };
  return {
    view,
    setView,
    navigate,
    navigateLatest,
    overlay,
    setOverlay,
    settingsCategory,
    openSettings,
    filesDirty,
    setFilesDirty,
    pendingView,
    discardPending,
    /** Stays on the project, keeping its unsaved file edits. */
    cancelPending: () => setPendingView(undefined),
    lastSession,
    lastProject,
  };
}
