import { useCallback, useRef, useState } from 'react';

/** The command palette's open state, and the element focus returns to when it closes. */
export function useSearchPalette() {
  const [searchOpen, setSearchOpen] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(() => {
    returnFocus.current = document.activeElement as HTMLElement;
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  return { searchOpen, returnFocus, openSearch, closeSearch };
}
