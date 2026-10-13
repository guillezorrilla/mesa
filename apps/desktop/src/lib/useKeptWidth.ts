import { useState } from 'react';
import { readKept, writeKept } from '@/lib/keptValue';

/** A resizable panel's width bounds, default, and arrow-key step, in pixels. */
export type WidthBounds = { min: number; max: number; initial: number; step: number };

/**
 * A resizable panel's width kept under `key` and its setter, which clamps to `bounds`; a kept
 * width that is missing, out of bounds, or unreadable reads as the default.
 */
export function useKeptWidth(key: string, bounds: WidthBounds) {
  const [width, setStored] = useState(() => {
    const kept = Number(readKept(key) ?? Number.NaN);
    return kept >= bounds.min && kept <= bounds.max ? kept : bounds.initial;
  });
  const setWidth = (next: number) => {
    const clamped = Math.min(bounds.max, Math.max(bounds.min, Math.round(next)));
    setStored(clamped);
    // ponytail: written on every drag move; a write per pointerup if storage ever shows in a profile.
    writeKept(key, String(clamped));
  };
  return [width, setWidth] as const;
}
