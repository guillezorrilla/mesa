import { createContext, useContext } from 'react';
import type { SettingsCategory } from './categories';

/**
 * Opens Settings on a category, for a screen deep in the workspace (Doctor, a session's details,
 * a workspace tip). The app provides it; a screen rendered on its own has none and offers no link.
 */
export const OpenSettingsContext = createContext<
  ((category: SettingsCategory) => void) | undefined
>(undefined);

export const useOpenSettings = () => useContext(OpenSettingsContext);
