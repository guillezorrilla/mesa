import { denserTabStyle, type SidebarTabStyle } from '@mesa/core/browser';
import { type RefObject, useEffect, useLayoutEffect, useState } from 'react';

/**
 * The style the tab bar in `bar` draws: `preferred`, or the next denser one while it overflows the
 * bar's width. It tries `preferred` again when the width or `content` (what changes the tabs'
 * widths) changes.
 */
export function useFittingTabStyle(
  bar: RefObject<HTMLElement | null>,
  preferred: SidebarTabStyle,
  content: string,
): SidebarTabStyle {
  const [style, setStyle] = useState(preferred);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([seen]) => seen && setWidth(seen.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [bar]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new width or content starts over from the preferred style.
  useLayoutEffect(() => setStyle(preferred), [preferred, width, content]);
  // Each render, before paint: one that overflows steps to the next denser style.
  useLayoutEffect(() => {
    const element = bar.current;
    const denser = denserTabStyle(style);
    if (element && denser && element.scrollWidth > element.clientWidth) setStyle(denser);
  });
  return style;
}
