import { type RefObject, useEffect } from 'react';

/** Scrolls the element inside `ref` whose `data-id` is `id` into view when `id` changes. */
export function useScrollToId(ref: RefObject<HTMLElement | null>, id: string | undefined) {
  useEffect(() => {
    if (!id) return;
    ref.current
      ?.querySelector(`[data-id="${CSS.escape(id)}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [ref, id]);
}
