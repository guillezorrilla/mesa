import { useCallback, useRef, useState } from 'react';
import type { PaletteMode } from '@/features/search/CommandPalette';

/**
 * The command palette's mode while open (undefined when closed), and the element focus returns to
 * when it closes: the one focused before it opened, kept when it changes mode.
 */
export function useSearchPalette() {
  const [mode, setMode] = useState<PaletteMode>();
  const returnFocus = useRef<HTMLElement | null>(null);
  const openSearch = useCallback(
    (next: PaletteMode = 'all') => {
      if (!mode) returnFocus.current = document.activeElement as HTMLElement | null;
      setMode(next);
    },
    [mode],
  );
  const closeSearch = useCallback(() => setMode(undefined), []);
  /** The shortcut for `next`: opens the palette in that mode, or closes it if already there. */
  const toggleSearch = useCallback(
    (next: PaletteMode) => (mode === next ? closeSearch() : openSearch(next)),
    [mode, openSearch, closeSearch],
  );
  return { mode, returnFocus, openSearch, closeSearch, toggleSearch };
}
