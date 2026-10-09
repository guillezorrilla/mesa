import {
  currentTerminalTheme,
  TERMINAL_COLOR_KEYS,
  type TerminalColorKey,
  type TerminalColors,
  type TerminalPaletteChoice,
  terminalPalette,
} from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { useInterfaceDark } from '@/lib/useInterfaceDark';
import { useSettings } from '../useSettings';

const sameColors = (a: Partial<TerminalColors> | undefined, b: TerminalColors) =>
  TERMINAL_COLOR_KEYS.every((key) => a?.[key]?.toLowerCase() === b[key]);

/**
 * The profile's terminal palette as Settings edits it: the colors shown, the choice active, and
 * the ways to change it. Editing a color saves all 20 as Custom, a moment after the last change
 * (a native picker sends many while it is dragged); leaving Custom waits for `confirm`.
 */
export function useTerminalPalette() {
  const { config, acting, saveAll } = useSettings();
  const saveAllRef = useRef(saveAll);
  saveAllRef.current = saveAll;
  const { terminal } = config;
  const dark = useInterfaceDark();
  // Colors being edited, ahead of the save.
  const [draft, setDraft] = useState<TerminalColors>();
  const sent = useRef<TerminalColors>(undefined);
  const [confirming, setConfirming] = useState<TerminalPaletteChoice>();
  const shown = draft ?? terminalPalette(terminal, dark);
  const active = draft ? 'custom' : currentTerminalTheme(terminal.theme);
  const custom = terminal.theme === 'custom';

  useEffect(() => {
    // One save at a time: a draft that comes in during one is saved after it.
    if (!draft || acting || sent.current === draft) return;
    const timer = setTimeout(() => {
      sent.current = draft;
      saveAllRef.current([
        ['terminal.colors', draft],
        ...(custom ? [] : [['terminal.theme', 'custom'] as const]),
      ]);
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, acting, custom]);
  // Saved: the profile's colors show again, so a change made elsewhere shows too.
  useEffect(() => {
    if (draft && sent.current === draft && custom && sameColors(terminal.colors, draft))
      setDraft(undefined);
  }, [draft, custom, terminal.colors]);

  const apply = (theme: TerminalPaletteChoice) => {
    setConfirming(undefined);
    setDraft(undefined);
    saveAllRef.current([['terminal.theme', theme]]);
  };
  return {
    shown,
    active,
    /** The choice waiting for the person to confirm leaving Custom. */
    confirming,
    pick: (theme: TerminalPaletteChoice) => {
      if (theme === active) return;
      if (custom || draft) setConfirming(theme);
      else apply(theme);
    },
    /** Custom, starting from the palette shown. */
    customize: () => active !== 'custom' && setDraft({ ...shown }),
    edit: (key: TerminalColorKey, color: string) => setDraft({ ...shown, [key]: color }),
    confirm: () => confirming && apply(confirming),
    cancel: () => setConfirming(undefined),
  };
}
