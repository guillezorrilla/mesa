import { useEffect, useRef } from 'react';

/** Runs `refresh` each time `stamp` changes after the first render: a panel's read again. */
export function useRefreshOnStamp(stamp: string, refresh: () => unknown) {
  const seen = useRef(stamp);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new stamp reads again.
  useEffect(() => {
    if (stamp !== seen.current) void refresh();
    seen.current = stamp;
  }, [stamp]);
}
