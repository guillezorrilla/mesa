import { useState } from 'react';

// ponytail: kept in this machine's localStorage, a convenience; another device starts fresh.

/** The value kept under `key`, or undefined if none or storage is unreadable. */
export const readKept = (key: string) => {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
};

/** Keeps `value` under `key`, or forgets it when undefined. */
export const writeKept = (key: string, value: string | undefined) => {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage refused (a private window, say): the value still holds in memory until the app quits.
  }
};

/**
 * The value kept under `key` and its setter, which keeps each new value: state that outlives a
 * visit. A new `key` reads its own kept value; with none yet (a profile still loading) nothing is
 * kept.
 */
export function useKept(key: string | undefined) {
  const read = () => (key === undefined ? undefined : readKept(key));
  const [picked, setPicked] = useState(() => ({ key, value: read() }));
  const value = picked.key === key ? picked.value : read();
  const keep = (next: string | undefined) => {
    setPicked({ key, value: next });
    if (key !== undefined) writeKept(key, next);
  };
  return [value, keep] as const;
}
