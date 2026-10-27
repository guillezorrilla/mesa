import { useState } from 'react';
import { readKept, writeKept } from '@/lib/keptValue';

/** A resizable panel's width bounds, default, and arrow-key step, in pixels. */
export type WidthBounds = { min: number; max: number; initial: number; step: number };

/**
 * A resizable panel's width kept under `key` and its setter, which clamps to `bounds`. A kept width
 * that is missing, out of bounds, or unreadable reads as the default, and follows `bounds.initial`
 * until one is kept.
 */
export function useKeptWidth(key: string, bounds: WidthBounds) {
  const [kept, setKept] = useState(() => {
    const value = Number(readKept(key) ?? Number.NaN);
    return value >= bounds.min && value <= bounds.max ? value : undefined;
  });
  const setWidth = (next: number) => {
    const clamped = Math.min(bounds.max, Math.max(bounds.min, Math.round(next)));
    setKept(clamped);
    // ponytail: written on every drag move; a write per pointerup if storage ever shows in a profile.
    writeKept(key, String(clamped));
  };
  return [kept ?? bounds.initial, setWidth] as const;
}
