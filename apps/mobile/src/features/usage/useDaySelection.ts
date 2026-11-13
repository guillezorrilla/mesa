import { useRef, useState } from 'react';
import type { LayoutRectangle } from 'react-native';
import { useExclusiveGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import { haptic } from '@/lib/haptics';
import { dayAt } from './chartScale';

/**
 * The chart's selected day, as Apple Health's charts take it: a tap on a bar selects that day, a
 * drag across the bars moves the selection day by day with a selection haptic, and a tap on the
 * selected bar again or anywhere else on the chart's card clears it. A vertical drag is left to the
 * screen's scroll. `bars` is where the bars lie in the card and `onBars` measures it; `toggle` is
 * what VoiceOver activates on a bar.
 */
export function useDaySelection(count: number) {
  const [selected, setSelected] = useState<number | null>(null);
  // The selection as the gesture callbacks last set it, read there without waiting for a render.
  const shown = useRef<number | null>(null);
  const bars = useRef<LayoutRectangle | null>(null);
  const dragging = useRef(false);

  const choose = (day: number | null) => {
    if (shown.current === day) return;
    shown.current = day;
    setSelected(day);
    if (day !== null) haptic('selection');
  };
  const toggle = (day: number) => choose(shown.current === day ? null : day);
  /** The day under a point in the card, or null off the bars; `clamped` (a drag) holds to the first and last. */
  const under = (x: number, y: number, clamped: boolean) => {
    const area = bars.current;
    if (!area || !count) return null;
    const across = x - area.x;
    const inside = across >= 0 && across < area.width && y >= area.y && y <= area.y + area.height;
    return clamped || inside ? dayAt(across, area.width, count) : null;
  };

  const pan = usePanGesture({
    disableReanimated: true,
    activeOffsetX: [-8, 8],
    failOffsetY: [-8, 8],
    onBegin: ({ x, y }) => {
      dragging.current = under(x, y, false) !== null;
    },
    onUpdate: ({ x, y }) => {
      if (dragging.current) choose(under(x, y, true));
    },
  });
  const tap = useTapGesture({
    disableReanimated: true,
    onActivate: ({ x, y }) => {
      const day = under(x, y, false);
      if (day === null) choose(null);
      else toggle(day);
    },
  });

  return {
    selected,
    toggle,
    gesture: useExclusiveGestures(pan, tap),
    onBars: (area: LayoutRectangle) => {
      bars.current = area;
    },
  };
}
