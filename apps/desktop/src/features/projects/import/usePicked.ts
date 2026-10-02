import type { BrowseChild, SourceId } from '@mesa/core';
import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useCall } from '@/lib/useCommand';

/** The kinds of node an import takes (BrowseChild); the rest only contain them. */
const IMPORTABLE = new Set(['page', 'issue']);
export const importable = (child: BrowseChild) => IMPORTABLE.has(child.kind);

/**
 * The Picker's ticked items, by node id. Ticking a page ticks it and, when it has pages under
 * it, names it in `asking`, for the person to choose whether to `include` them: every one Mesa
 * walks to (its cap, which the toast names when it stops there).
 */
export function usePicked(source: SourceId) {
  const call = useCall();
  const toast = useToast();
  const [picked, setPicked] = useState(new Map<string, BrowseChild>());
  const [asking, setAsking] = useState<BrowseChild>();
  const [including, setIncluding] = useState(false);
  const mark = useCallback((children: BrowseChild[], on: boolean) => {
    setPicked((last) => {
      const next = new Map(last);
      for (const child of children) {
        if (on) next.set(child.id, child);
        else next.delete(child.id);
      }
      return next;
    });
  }, []);
  const tick = async (child: BrowseChild, on: boolean) => {
    mark([child], on);
    if (!on || child.kind !== 'page') return;
    const under = await call('sources.browse', { source, node: child.id });
    if (under.ok && under.data.children.length) setAsking(child);
  };
  const include = async (page: BrowseChild) => {
    setAsking(undefined);
    setIncluding(true);
    const walked = await call('sources.browse', { source, node: page.id, descendants: true });
    setIncluding(false);
    if (!walked.ok) return toast(walked.error.message);
    const pages = walked.data.children.filter(importable);
    mark(pages, true);
    if (walked.data.capped) {
      toast(`Ticked the first ${pages.length} pages under ${page.title}: Mesa stops there`);
    }
  };
  return {
    picked,
    tick,
    asking,
    including,
    include,
    dismiss: () => setAsking(undefined),
  };
}

export type Picked = ReturnType<typeof usePicked>;
