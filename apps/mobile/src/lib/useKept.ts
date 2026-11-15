import { useSyncExternalStore } from 'react';
import { fileStore } from './fileStore';
import { parseStringMap } from './stringMap';

// The choices a screen was left in (a tab's segment, a project, a view, a filter), kept in the
// app's documents so leaving the tab, or quitting the app, and coming back shows the same thing.
const kept = fileStore('kept.json', parseStringMap, {});

/** The value kept under `key` and its setter; undefined forgets it. As the desktop's useKept. */
export function useKept(key: string) {
  const value = useSyncExternalStore(kept.subscribe, kept.get)[key];
  const keep = (next: string | undefined) => {
    const { [key]: _, ...rest } = kept.get();
    kept.set(next === undefined ? rest : { ...rest, [key]: next });
  };
  return [value, keep] as const;
}
