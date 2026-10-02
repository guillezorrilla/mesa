import { createContext, useContext } from 'react';

/** The settings search text: a row whose words do not hold it is hidden. */
export const SettingsQuery = createContext('');

/** Whether `text` holds the settings search; with no search, everything matches. */
export function useMatches(text: string) {
  const query = useContext(SettingsQuery).trim().toLowerCase();
  return !query || text.toLowerCase().includes(query);
}
