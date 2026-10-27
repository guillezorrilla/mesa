import { useState } from 'react';

/**
 * A set of keys a person toggles one at a time, such as a tree's open folders: the set, the
 * toggle for one key, and the setter for changes of several at once. `initial` gives the keys it
 * starts with.
 */
export function useToggleSet(initial?: () => Iterable<string>) {
  const [set, setSet] = useState<ReadonlySet<string>>(() => new Set(initial?.()));
  const toggle = (key: string) =>
    setSet((last) => {
      const next = new Set(last);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return [set, toggle, setSet] as const;
}
