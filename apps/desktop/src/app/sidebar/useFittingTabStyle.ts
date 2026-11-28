import { denserTabStyle, type SidebarTabStyle } from '@mesa/core/browser';
import { type RefObject, useLayoutEffect, useState } from 'react';
import { useElementWidth } from '@/lib/useElementWidth';

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
  const width = useElementWidth(bar, 0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new width or content starts over from the preferred style.
  useLayoutEffect(() => setStyle(preferred), [preferred, width, content]);
  // Before paint: a style that overflows steps to the next denser one, until one fits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measured again only when what it draws changes.
  useLayoutEffect(() => {
    const element = bar.current;
    const denser = denserTabStyle(style);
    if (element && denser && element.scrollWidth > element.clientWidth) setStyle(denser);
  }, [style, preferred, width, content]);
  return style;
}
