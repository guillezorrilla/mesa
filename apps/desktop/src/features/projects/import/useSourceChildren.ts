import type { BrowseChild, Result, SourceId } from '@mesa/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCall } from '@/lib/useCommand';

export type BrowseError = Extract<Result<unknown>, { ok: false }>['error'];

type Children = {
  children: BrowseChild[];
  /** Where the next page starts; none at the end. */
  cursor?: string;
  error?: BrowseError;
  loading: boolean;
};

/**
 * One node's children in a source's tree (the root's without a node, or what `search` finds
 * under it), loaded on mount: `more` appends the next page, `retry` loads the first again. A reply
 * that a newer load superseded is dropped.
 */
export function useSourceChildren(source: SourceId, node: string | undefined, search?: string) {
  const call = useCall();
  const [state, setState] = useState<Children>({ children: [], loading: true });
  const latest = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const id = ++latest.current;
      setState((last) => ({ ...last, loading: true, error: undefined }));
      const result = await call('sources.browse', {
        source,
        ...(node ? { node } : {}),
        ...(cursor ? { cursor } : {}),
        ...(search ? { search } : {}),
      });
      if (id !== latest.current) return;
      setState((last) =>
        result.ok
          ? {
              children: cursor ? [...last.children, ...result.data.children] : result.data.children,
              ...(result.data.cursor ? { cursor: result.data.cursor } : {}),
              loading: false,
            }
          : { ...last, error: result.error, loading: false },
      );
    },
    [call, source, node, search],
  );
  useEffect(() => {
    void load();
  }, [load]);
  return { ...state, more: () => void load(state.cursor), retry: () => void load() };
}
