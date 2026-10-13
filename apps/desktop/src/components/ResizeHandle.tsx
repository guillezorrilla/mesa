import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { WidthBounds } from '@/lib/useKeptWidth';
import { cn } from '@/lib/utils';

/**
 * A panel's resizable edge, `right` for one that grows rightwards (the sidebar), `left` for one
 * that grows leftwards (a side panel): dragging it, or Left and Right with it focused, sets the
 * width; a double-click puts the default back. `onWidth` clamps.
 */
export function ResizeHandle(props: {
  label: string;
  edge: 'left' | 'right';
  width: number;
  bounds: WidthBounds;
  onWidth: (width: number) => void;
}) {
  const { width, onWidth, bounds } = props;
  // Dragging a left edge leftwards widens the panel.
  const sign = props.edge === 'right' ? 1 : -1;
  const startDrag = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const start = event.clientX;
    const move = (moved: PointerEvent) => onWidth(width + sign * (moved.clientX - start));
    const stop = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', stop);
      document.removeEventListener('pointercancel', stop);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  };
  const step = (event: KeyboardEvent) => {
    const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!direction) return;
    event.preventDefault();
    onWidth(width + sign * direction * bounds.step);
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
      onDoubleClick={() => onWidth(bounds.initial)}
      className={cn(
        'absolute inset-y-0 z-10 w-2 cursor-col-resize outline-none transition-colors hover:bg-border focus-visible:bg-ring',
        props.edge === 'right' ? '-right-1' : '-left-1',
      )}
    />
  );
}
