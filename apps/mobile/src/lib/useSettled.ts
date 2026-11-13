import { useEffect, useState } from 'react';

/**
 * What `promise` resolved to, without suspending: undefined until the first settles, then the
 * last value kept while a newer promise is pending. For a glance (a tab's badge) at data a screen
 * reads with `use()`.
 */
export function useSettled<T>(promise: Promise<T>) {
  const [value, setValue] = useState<T>();
  useEffect(() => {
    let current = true;
    promise.then((settled) => {
      if (current) setValue(settled);
    });
    return () => {
      current = false;
    };
  }, [promise]);
  return value;
}
