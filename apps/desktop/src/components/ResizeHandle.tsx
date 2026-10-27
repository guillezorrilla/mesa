import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { WidthBounds } from '@/lib/useKeptWidth';
import { cn } from '@/lib/utils';

/**
 * A panel's resizable edge, `right` for one that grows rightwards (the sidebar), `left` for one
 * that grows leftwards (a side panel): dragging it, or Left and Right with it focused, sets the
 * width; a double-click puts the default back. `onWidth` clamps to the bounds. A drag or a step
 * starts from the width the panel (its parent) is drawn at, which a CSS cap can hold below
 * `width`, and with `keep` stops where the panel's neighbour would drop below that many pixels.
 */
export function ResizeHandle(props: {
  label: string;
  edge: 'left' | 'right';
  width: number;
  bounds: WidthBounds;
  /** The pixels the panel's neighbour in its container keeps, however far it is dragged. */
  keep?: number;
  onWidth: (width: number) => void;
}) {
  const { width, onWidth, bounds, keep } = props;
  // Dragging a left edge leftwards widens the panel.
  const sign = props.edge === 'right' ? 1 : -1;
  /** Where a drag, a step or a reset from `handle` starts, and the widest it may go; read once. */
  const measure = (handle: HTMLElement) => {
    const panel = handle.parentElement;
    const room = panel?.parentElement?.clientWidth;
    // No layout (a test) measures nothing: the width as set, and no room limit.
    return {
      from: panel?.offsetWidth || width,
      most: keep !== undefined && room ? room - keep : Infinity,
    };
  };
  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = event.clientX;
    const { from, most } = measure(event.currentTarget);
    const move = (moved: PointerEvent) =>
      onWidth(Math.min(most, from + sign * (moved.clientX - start)));
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  };
  const step = (event: KeyboardEvent<HTMLElement>) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    const { from, most } = measure(event.currentTarget);
    onWidth(Math.min(most, from + sign * direction * bounds.step));
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is a widget; <hr> cannot take focus or a value.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={props.label}
      aria-valuenow={width}
      aria-valuemin={bounds.min}
      aria-valuemax={bounds.max}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={step}
      onDoubleClick={(event) =>
        onWidth(Math.min(measure(event.currentTarget).most, bounds.initial))
      }
      className={cn(
        'absolute inset-y-0 z-10 w-2 cursor-col-resize outline-none transition-colors hover:bg-border focus-visible:bg-ring',
        props.edge === 'right' ? '-right-1' : '-left-1',
      )}
    />
  );
}
