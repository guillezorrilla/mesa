import { useEffect, useRef } from 'react';

/**
 * A count that moves on each time the selected session changes, so an action that ends after a
 * change leaves the new selection alone.
 */
export function useSelectionVersion(selectedSession: string | undefined) {
  const version = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: it counts each change of selection.
  useEffect(() => {
    version.current += 1;
  }, [selectedSession]);
  return version;
}
