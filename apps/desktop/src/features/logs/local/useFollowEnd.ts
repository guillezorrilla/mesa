import { useLayoutEffect, useRef, useState } from 'react';

/** Within this many pixels of the end, the list counts as scrolled to it and follows new entries. */
const AT_END_PX = 40;

/**
 * Keeps a list scrolled to its end as `items` grow, unless the person scrolled up; then counts the
 * items after the last one they saw, for a "12 new" pill whose `jump` goes back to the end.
 */
export function useFollowEnd(items: readonly { key: string }[]) {
  const ref = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  /** The last item shown when the person scrolled up. */
  const [seen, setSeen] = useState<string>();
  useLayoutEffect(() => {
    const box = ref.current;
    if (box && atEnd && items.length) box.scrollTop = box.scrollHeight;
  });
  const at = seen === undefined ? -1 : items.findIndex((item) => item.key === seen);
  return {
    ref,
    onScroll: () => {
      const box = ref.current;
      if (!box) return;
      const end = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END_PX;
      if (end === atEnd) return;
      setAtEnd(end);
      setSeen(end ? undefined : items.at(-1)?.key);
    },
    /** Items that came after the last one seen, while scrolled up. */
    newCount: atEnd || seen === undefined ? 0 : at < 0 ? items.length : items.length - 1 - at,
    jump: () => {
      setAtEnd(true);
      setSeen(undefined);
    },
  };
}
