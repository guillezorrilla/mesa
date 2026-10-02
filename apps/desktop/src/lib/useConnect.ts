import type { SourceId } from '@mesa/core';
import { useCallback, useState } from 'react';
import { useRun } from './useCommand';

/**
 * Signing in to a source in the browser (`mesa sources connect`): `connect` resolves with the
 * connected row, or undefined once a failure is toasted; `signingIn` while the browser is open.
 */
export function useConnect() {
  const run = useRun();
  const [signingIn, setSigningIn] = useState(false);
  const connect = useCallback(
    async (source: SourceId) => {
      setSigningIn(true);
      try {
        return await run('sources.connect', { source });
      } finally {
        setSigningIn(false);
      }
    },
    [run],
  );
  return { signingIn, connect };
}
