import { type RefObject, useEffect } from 'react';

/**
 * Closes it (`setOpen(false)`) while `open` when a click or focus lands outside `ref`, or Esc is pressed in it;
 * nothing while `paused`. A Radix menu portals its content out of `ref`, so that counts as
 * inside, and an Esc there only closes the menu. Switching apps moves no focus in the page.
 */
export function useFoldOnLeave(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
  paused: boolean,
) {
  useEffect(() => {
    const box = ref.current;
    if (!open || paused || !box) return;
    const outside = (event: Event) => {
      const target = event.target as Element;
      if (box.contains(target) || target.closest?.('[data-radix-popper-content-wrapper]')) return;
      setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      (event.target as HTMLElement).blur();
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    box.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      box.removeEventListener('keydown', onEscape);
    };
  }, [ref, open, setOpen, paused]);
}
