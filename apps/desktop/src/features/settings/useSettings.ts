import type { Config } from '@mesa/core';
import { createContext, useContext } from 'react';

/** The profile config every settings page reads, and the one way each saves a field. */
export type Settings = {
  config: Config;
  acting: boolean;
  /** `mesa config set <path> <value>`, then the config is read again. */
  save: (path: string, value: unknown) => void;
  /** Several fields in order, one `mesa config set` each, as one action. */
  saveAll: (fields: readonly (readonly [path: string, value: unknown])[]) => void;
  /** Reads the config again, after another command changed it (`mesa decisions use`). */
  reload: () => Promise<void>;
};

export const SettingsContext = createContext<Settings | undefined>(undefined);

export function useSettings(): Settings {
  const settings = useContext(SettingsContext);
  if (!settings) throw new Error('useSettings is used outside the settings window');
  return settings;
}
