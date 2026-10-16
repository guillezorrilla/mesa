import { moveSession } from '@mesa/core/browser';
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react';

/** How far a press moves, in pixels, before it drags, so a click still selects. */
const SLOP = 4;
const SLIDE = 'transform 150ms ease';

/** A project's cards, in their shown order: the rail a card moves along and never leaves. */
export type Rail = { project: string; ids: string[] };

type Drag = {
  ids: string[];
  from: number;
  /** Where it would land, which slides the siblings between. */
  to: number;
  /** How far a sibling slides to open the gap: the card's height and the gap below it. */
  step: number;
};

/**
 * Drag to reorder session cards within their rail: press a card and move it, and it follows the
 * pointer, kept inside the rail, while its siblings slide to open the gap where it would land.
 * Release calls `onDrop` with the project and its ids in their new order; Escape cancels. The
 * click a drag ends with is swallowed, so it never selects. Each card wraps in an element with
 * `data-drag-id={id}`, `onPointerDown={(event) => start(event, rail, id)}`, and `style={style(id)}`.
 */
export function useCardDrag(onDrop: (project: string, ids: string[]) => void) {
  const [drag, setDrag] = useState<Drag>();
  const stop = useRef<() => void>(undefined);
  useEffect(() => () => stop.current?.(), []);

  const start = (event: PointerEvent<HTMLElement>, rail: Rail, id: string) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const card = event.currentTarget;
    const { ids } = rail;
    const rects = ids.map((each) =>
      card.parentElement?.querySelector(`[data-drag-id="${each}"]`)?.getBoundingClientRect(),
    );
    const from = ids.indexOf(id);
    const own = rects[from];
    const first = rects[0];
    const last = rects.at(-1);
    if (ids.length < 2 || !own || !first || !last || rects.some((rect) => !rect)) return;
    const neighbour = rects[from + 1] ?? rects[from - 1];
    const gap = !neighbour
      ? 0
      : neighbour.top > own.top
        ? neighbour.top - own.bottom
        : own.top - neighbour.bottom;
    const step = own.height + gap;
    const centers = rects.map((rect) => (rect ? rect.top + rect.height / 2 : 0));
    const startX = event.clientX;
    const startY = event.clientY;
    let to: number | undefined;
    let cancelled = false;

    const move = (pointer: globalThis.PointerEvent) => {
      if (cancelled) return;
      const raw = pointer.clientY - startY;
      if (to === undefined && Math.hypot(pointer.clientX - startX, raw) < SLOP) return;
      if (to === undefined) {
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const dy = Math.min(Math.max(raw, first.top - own.top), last.bottom - own.bottom);
      // The card itself follows the pointer outside React; a render comes only when `to` moves.
      card.style.transform = `translateY(${dy}px)`;
      const center = (centers[from] ?? 0) + dy;
      const next = centers.filter((each, index) => index !== from && each < center).length;
      if (next !== to) setDrag({ ids, from, to: next, step });
      to = next;
    };
    const cancel = () => {
      cancelled = true;
      card.style.transform = '';
      setDrag(undefined);
    };
    const key = (press: KeyboardEvent) => {
      if (press.key !== 'Escape' || to === undefined) return;
      // Before the Sessions tab's own Escape, which would clear the selection.
      press.preventDefault();
      press.stopPropagation();
      cancel();
    };
    const up = () => {
      end();
      if (to === undefined) return;
      const swallow = (click: MouseEvent) => {
        click.preventDefault();
        click.stopPropagation();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }));
      card.style.transform = '';
      setDrag(undefined);
      if (!cancelled && to !== from) onDrop(rail.project, moveSession(ids, id, to));
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

  /** Where a card sits while a drag is on: the dragged one raised, a sibling slid aside. */
  const style = (id: string): CSSProperties | undefined => {
    if (!drag) return undefined;
    const index = drag.ids.indexOf(id);
    if (index < 0) return undefined;
    const { from, to, step } = drag;
    if (index === from) return { position: 'relative', zIndex: 20 };
    const slide = index > from && index <= to ? -step : index >= to && index < from ? step : 0;
    return { transform: `translateY(${slide}px)`, transition: SLIDE };
  };

  return { start, style, dragging: drag ? drag.ids[drag.from] : undefined };
}
