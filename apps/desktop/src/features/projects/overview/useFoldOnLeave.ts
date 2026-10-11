import { type KeyboardEvent, useEffect, useRef } from 'react';

/**
 * Closes a box (`setOpen(false)`) while `open` when a click or focus lands outside it, or Esc is
 * pressed in it; nothing while `paused`. Spread the returned handlers on the box. Inside means
 * inside its React tree, so a menu or dialog it portals out still counts, and an Esc that menu
 * handles stays the menu's. Switching apps moves no focus in the page, so the box stays open.
 */
export function useFoldOnLeave(open: boolean, setOpen: (open: boolean) => void, paused: boolean) {
  const inside = useRef(false);
  useEffect(() => {
    if (!open || paused) return;
    // Capture on document runs before React's handlers, the bubble listener after them.
    const reset = () => {
      inside.current = false;
    };
    const leave = () => {
      if (!inside.current) setOpen(false);
    };
    for (const type of ['pointerdown', 'focusin']) {
      document.addEventListener(type, reset, true);
      document.addEventListener(type, leave);
    }
    return () => {
      for (const type of ['pointerdown', 'focusin']) {
        document.removeEventListener(type, reset, true);
        document.removeEventListener(type, leave);
      }
    };
  }, [open, paused, setOpen]);
  const mark = () => {
    inside.current = true;
  };
  return {
    onPointerDownCapture: mark,
    onFocusCapture: mark,
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !open || paused) return;
      event.preventDefault();
      setOpen(false);
      (event.target as HTMLElement).blur();
    },
  };
}
