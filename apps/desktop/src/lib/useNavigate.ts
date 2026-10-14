import { createContext, useContext } from 'react';
import type { WorkspaceView } from './workspaceView';

/**
 * Opens a workspace view, for a piece deep in a screen (a session's details) that links elsewhere.
 * The app provides it; a piece rendered on its own has none and offers no link.
 */
export const NavigateContext = createContext<((view: WorkspaceView) => void) | undefined>(
  undefined,
);

export const useNavigate = () => useContext(NavigateContext);
