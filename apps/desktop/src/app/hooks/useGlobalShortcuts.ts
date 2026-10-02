import type { Shortcuts } from '@mesa/core';
import { shortcutFromKeys } from '@mesa/core/browser';
import { useEffect, useRef } from 'react';
import { FIXED_SHORTCUTS, pressed } from '@/lib/fixedShortcuts';

/**
 * The window-wide keys: the profile's search, Board, and new session shortcuts, and the fixed
 * keyboard shortcuts key. Each calls its action with the latest props, once per press: a held key's
 * repeats are ignored, so holding New session never starts one session per repeat.
 */
export function useGlobalShortcuts(props: {
  shortcuts: Shortcuts;
  onSearch: () => void;
  onKeyboardShortcuts: () => void;
  onBoard: () => void;
  onNewSession: () => void;
}) {
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const { shortcuts, onSearch, onKeyboardShortcuts, onBoard, onNewSession } = latest.current;
      const key = shortcutFromKeys(event);
      if (key === shortcuts.search) {
        event.preventDefault();
        onSearch();
      } else if (pressed(event, FIXED_SHORTCUTS.keyboardShortcuts)) {
        event.preventDefault();
        onKeyboardShortcuts();
      } else if (key === shortcuts.board) {
        event.preventDefault();
        onBoard();
      } else if (key === shortcuts.newSession) {
        event.preventDefault();
        onNewSession();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
}
