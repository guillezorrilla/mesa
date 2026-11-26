import { type RefObject, useEffect, useState } from 'react';

/** The width `element` is drawn at, in whole pixels, `initial` until it is first measured. */
export function useElementWidth(element: RefObject<HTMLElement | null>, initial: number): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const seen = element.current;
    if (!seen || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(seen);
    return () => observer.disconnect();
  }, [element]);
  return width;
}
