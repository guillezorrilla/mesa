import { useState } from 'react';

/**
 * A set of keys a person toggles one at a time, such as a tree's open folders: the set, the
 * toggle for one key, and the setter for changes of several at once.
 */
export function useToggleSet<T = string>() {
  const [set, setSet] = useState<ReadonlySet<T>>(new Set());
  const toggle = (key: T) =>
    setSet((last) => {
      const next = new Set(last);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return [set, toggle, setSet] as const;
}
