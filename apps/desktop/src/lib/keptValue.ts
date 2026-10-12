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
