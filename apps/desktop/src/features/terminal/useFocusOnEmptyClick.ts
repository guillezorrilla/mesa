import { useEffect, useRef } from 'react';

/**
 * What keeps a click: a control, a link, anything editable or tabbable, or a menu, which in the
 * app is also an open `<details>` popover.
 */
const INTERACTIVE =
  'a, button, input, textarea, select, label, details, [contenteditable], [tabindex]:not([tabindex="-1"]), [role="button"], [role="tab"], [role="option"], [role="menu"], [role="menuitem"]';

/**
 * While `active`, a click inside a `data-returns-focus` region that lands on nothing interactive,
 * leaves the keyboard nowhere, and selects no text calls `focus`: the session in view takes the
 * keyboard back.
 */
export function useFocusOnEmptyClick(active: boolean | undefined, focus: () => void) {
  const refocus = useRef(focus);
  refocus.current = focus;
  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-returns-focus]') || target.closest(INTERACTIVE)) return;
      const held = document.activeElement;
      if (held && held !== document.body) return;
      if (window.getSelection()?.isCollapsed === false) return;
      refocus.current();
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [active]);
}
