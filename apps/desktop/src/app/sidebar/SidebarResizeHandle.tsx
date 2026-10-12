import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { SIDEBAR_WIDTH } from './useSidebarWidth';

/**
 * The expanded sidebar's right edge: dragging it, or Left and Right with it focused, sets the
 * width; a double-click puts the default back. `onWidth` clamps.
 */
export function SidebarResizeHandle(props: { width: number; onWidth: (width: number) => void }) {
  const { width, onWidth } = props;
  const startDrag = (event: ReactPointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const offset = event.clientX - width;
    const move = (moved: PointerEvent) => onWidth(moved.clientX - offset);
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
    const sign = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!sign) return;
    event.preventDefault();
    onWidth(width + sign * SIDEBAR_WIDTH.step);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: a focusable separator is a widget; <hr> cannot take focus or a value.
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      tabIndex={0}
      onPointerDown={startDrag}
      onKeyDown={step}
      onDoubleClick={() => onWidth(SIDEBAR_WIDTH.initial)}
      className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize outline-none transition-colors hover:bg-border focus-visible:bg-ring"
    />
  );
}
