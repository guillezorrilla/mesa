import type { CallResult } from '@mesa/core/phone';
import { startTransition, useState } from 'react';
import { type MacRead, tryCall } from '../mac/tryCall';
import { useMac } from '../mac/useMac';
import { useMacRead } from '../mac/useMacRead';

/** A session's worktree to browse: its tree, the folder open, and a search of names or text. */
export function useFiles(id: string) {
  const link = useMac();
  const { answer: tree } = useMacRead({ method: 'files', id });
  const [folder, setFolder] = useState('');
  const [inText, setInText] = useState(false);
  const [found, setFound] = useState<Promise<MacRead<CallResult<'search'>>>>();
  const searchFor = (query: string) =>
    tryCall(link, () =>
      link.call({ method: 'search', id, query, mode: inText ? 'content' : 'name' }),
    );
  return {
    tree,
    folder,
    open: setFolder,
    inText,
    setInText,
    found,
    search: (query: string) => {
      const next = query.trim() ? searchFor(query.trim()) : undefined;
      startTransition(() => setFound(next));
    },
  };
}
