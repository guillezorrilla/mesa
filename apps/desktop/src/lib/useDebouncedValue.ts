import { useEffect, useState } from 'react';

/**
 * `value` once it has stopped changing for `ms`: a search typed into a field that asks a tracker
 * reads once the person pauses, not on every key. React's useDeferredValue only defers a render,
 * so it would still ask on every key.
 */
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
