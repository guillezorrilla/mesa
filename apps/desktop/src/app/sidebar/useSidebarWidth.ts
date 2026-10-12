import { useState } from 'react';
import { readKept, writeKept } from '@/lib/keptValue';

/** The expanded sidebar's width bounds, default, and arrow-key step, in pixels. */
export const SIDEBAR_WIDTH = { min: 200, max: 480, initial: 264, step: 16 };

const KEY = 'mesa.sidebar.width';

const clamp = (width: number) =>
  Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, Math.round(width)));

/** The width last kept, or the default when it is missing, out of bounds, or unreadable. */
const stored = () => {
  const width = Number(readKept(KEY) ?? Number.NaN);
  return width >= SIDEBAR_WIDTH.min && width <= SIDEBAR_WIDTH.max ? width : SIDEBAR_WIDTH.initial;
};

/** The expanded sidebar's width and its setter, which clamps to the bounds and keeps it across launches. */
export function useSidebarWidth() {
  const [width, setStored] = useState(stored);
  const setWidth = (next: number) => {
    const clamped = clamp(next);
    setStored(clamped);
    // ponytail: written on every drag move; a write per pointerup if storage ever shows in a profile.
    writeKept(KEY, String(clamped));
  };
  return [width, setWidth] as const;
}
