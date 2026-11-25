import { FIXED_SHORTCUTS } from '@mesa/core/browser';
import { useEffect } from 'react';
import { useKept } from '@/lib/keptValue';
import { pressed } from '@/lib/shortcutKeys';
import { useKeptWidth } from '@/lib/useKeptWidth';

/** The panel's width bounds beside the terminal, which always keeps TERMINAL_MIN pixels. */
export const LOGS_WIDTH = { min: 360, max: 1400, initial: 560, step: 32 };
export const TERMINAL_MIN = 256;

/**
 * The Logs panel's place in the session area, kept per project: its width beside the terminal, and
 * whether it is maximized over the whole area (Mod+Shift+M, or Esc to return).
 */
export function useLogsLayout(project: string | undefined) {
  const [width, resize] = useKeptWidth(`mesa.logs.width.${project ?? ''}`, LOGS_WIDTH);
  const [kept, keep] = useKept(project && `mesa.logs.maximized.${project}`);
  const maximized = kept === 'true';
  const setMaximized = (on: boolean) => keep(on ? 'true' : undefined);
  const toggle = () => setMaximized(!maximized);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !pressed(event, FIXED_SHORTCUTS.maximizeLogs)) return;
      event.preventDefault();
      keep(maximized ? undefined : 'true');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maximized, keep]);
  return { width, resize, maximized, setMaximized, toggle };
}
