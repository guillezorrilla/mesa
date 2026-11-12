import type { CallResult } from '@mesa/core/phone';
import { startTransition, useState } from 'react';
import { type MacRead, tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';

/** A search of the worktree's file names, or of their text with `inText`; none while empty. */
export function useFileSearch(id: string) {
  const link = useMac();
  const [inText, setInText] = useState(false);
  const [found, setFound] = useState<Promise<MacRead<CallResult<'search'>>>>();
  const search = (query: string) => {
    const mode = inText ? 'content' : 'name';
    const next = query.trim()
      ? tryCall(link, () => link.call({ method: 'search', id, query: query.trim(), mode }))
      : undefined;
    startTransition(() => setFound(next));
  };
  return { inText, setInText, found, search };
}
