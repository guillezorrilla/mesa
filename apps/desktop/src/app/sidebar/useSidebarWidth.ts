import { useState } from 'react';

/** The expanded sidebar's width bounds, default, and arrow-key step, in pixels. */
export const SIDEBAR_WIDTH = { min: 200, max: 480, initial: 264, step: 16 };

// ponytail: kept in this machine's localStorage, a convenience; another device starts fresh.
const KEY = 'mesa.sidebar.width';

const clamp = (width: number) =>
  Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, Math.round(width)));

/** The width last kept, or the default when it is missing, out of bounds, or unreadable. */
const stored = () => {
  try {
    const width = Number(localStorage.getItem(KEY) ?? Number.NaN);
    return width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max ? width : SIDEBAR_WIDTH.initial;
  } catch {
    return SIDEBAR_WIDTH.initial;
  }
};

/** The expanded sidebar's width and its setter, which clamps to the bounds and keeps it across launches. */
export function useSidebarWidth() {
  const [width, setStored] = useState(stored);
  const setWidth = (next: number) => {
    const clamped = clamp(next);
    setStored(clamped);
    try {
      localStorage.setItem(KEY, String(clamped));
    } catch {
      // Storage refused: the width still holds until the app quits.
    }
  };
  return [width, setWidth] as const;
}
