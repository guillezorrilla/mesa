import { FIXED_SHORTCUTS } from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { pressed } from '@/lib/shortcutKeys';

/** The Files tab's side pane, Files or Search, and Cmd+P and Cmd+Shift+F, which show and focus it. */
export function useFilePanes() {
  const [pane, setPane] = useState<'files' | 'search'>('files');
  const goToInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  /** Shows a pane and focuses its field, as Cmd+P and Cmd+Shift+F do. */
  const focusPane = (name: 'files' | 'search') => {
    setPane(name);
    requestAnimationFrame(() => (name === 'search' ? searchInput : goToInput).current?.focus());
  };
  const focusPaneRef = useRef(focusPane);
  focusPaneRef.current = focusPane;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const pane = pressed(event, FIXED_SHORTCUTS.findInFiles)
        ? 'search'
        : pressed(event, FIXED_SHORTCUTS.goToFile)
          ? 'files'
          : undefined;
      if (!pane) return;
      event.preventDefault();
      focusPaneRef.current(pane);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  return { pane, setPane, focusPane, goToInput, searchInput };
}
