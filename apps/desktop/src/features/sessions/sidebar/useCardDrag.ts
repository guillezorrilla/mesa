import { moveSession } from '@mesa/core/browser';
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react';

/** How far a press moves, in pixels, before it drags, so a click still selects. */
const SLOP = 4;
const SLIDE = 'transform 150ms ease';

type Drag = {
  /** The rail's card ids, in their order when the drag began. */
  ids: string[];
  from: number;
  to: number;
  /** How far the card has moved from its place, kept inside the rail. */
  dy: number;
  /** How far a sibling slides to open the gap: the card's height and the gap below it. */
  step: number;
};

/** `[data-drag-id]` cards that share a parent, the rail, which the card never leaves. */
const DRAG_ID = 'data-drag-id';

/**
 * Drag to reorder session cards within their rail: press a card and move it, and it follows the
 * pointer, kept inside the rail, while its siblings slide to open the gap where it would land.
 * Release calls `onDrop` with the rail's ids in their new order and the `rail` given to `start`;
 * Escape cancels. The click a drag
 * ends with is swallowed, so it never selects. Each card wraps in an element with `data-drag-id`,
 * `onPointerDown={(event) => start(event, rail)}`, and `style={style(id)}`.
 */
export function useCardDrag(onDrop: (ids: string[], rail: string) => void) {
  const [drag, setDrag] = useState<Drag>();
  const stop = useRef<() => void>(undefined);
  useEffect(() => () => stop.current?.(), []);

  const start = (event: PointerEvent<HTMLElement>, rail: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const card = event.currentTarget;
    const cards = [...(card.parentElement?.children ?? [])].filter(
      (each): each is HTMLElement => each instanceof HTMLElement && each.hasAttribute(DRAG_ID),
    );
    if (cards.length < 2) return;
    const ids = cards.map((each) => each.getAttribute(DRAG_ID) ?? '');
    const rects = cards.map((each) => each.getBoundingClientRect());
    const from = cards.indexOf(card);
    const own = rects[from];
    const first = rects[0];
    const last = rects[rects.length - 1];
    if (!own || !first || !last) return;
    const neighbour = rects[from + 1] ?? rects[from - 1];
    const gap = neighbour
      ? neighbour.top > own.top
        ? neighbour.top - own.bottom
        : own.top - neighbour.bottom
      : 0;
    const step = own.height + gap;
    const centers = rects.map((rect) => rect.top + rect.height / 2);
    const startX = event.clientX;
    const startY = event.clientY;
    let current: Drag | undefined;
    let cancelled = false;

    const move = (pointer: globalThis.PointerEvent) => {
      if (cancelled) return;
      const raw = pointer.clientY - startY;
      if (!current && Math.hypot(pointer.clientX - startX, raw) < SLOP) return;
      if (!current) {
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const dy = Math.min(Math.max(raw, first.top - own.top), last.bottom - own.bottom);
      const center = (centers[from] ?? 0) + dy;
      const to = centers.filter((each, index) => index !== from && each < center).length;
      current = { ids, from, to, dy, step };
      setDrag(current);
    };
    const cancel = () => {
      cancelled = true;
      setDrag(undefined);
    };
    const key = (press: KeyboardEvent) => {
      if (press.key !== 'Escape' || !current) return;
      // Before the Sessions tab's own Escape, which would clear the selection.
      press.preventDefault();
      press.stopPropagation();
      cancel();
    };
    const up = () => {
      end();
      if (!current) return;
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
      setDrag(undefined);
      const id = ids[from];
      if (!cancelled && id && current.to !== from) onDrop(moveSession(ids, id, current.to), rail);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancelAndEnd);
      window.removeEventListener('keydown', key, { capture: true });
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      stop.current = undefined;
    };
    const cancelAndEnd = () => {
      cancel();
      end();
    };
    stop.current?.();
    stop.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancelAndEnd);
    window.addEventListener('keydown', key, { capture: true });
  };

  /** Where a card sits while a drag is on: the dragged one under the pointer, a sibling slid aside. */
  const style = (id: string): CSSProperties | undefined => {
    if (!drag) return undefined;
    const index = drag.ids.indexOf(id);
    if (index < 0) return undefined;
    const { from, to, dy, step } = drag;
    if (index === from)
      return { transform: `translateY(${dy}px)`, position: 'relative', zIndex: 20 };
    const slide =
      from < to && index > from && index <= to
        ? -step
        : to < from && index >= to && index < from
          ? step
          : 0;
    return { transform: `translateY(${slide}px)`, transition: SLIDE };
  };

  return { start, style, dragging: drag ? drag.ids[drag.from] : undefined };
}
