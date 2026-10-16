import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { moveSession } from '@mesa/core/browser';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** How far a press moves, in pixels, before it drags, so a click still selects. */
const SLOP = 4;
const MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];

/**
 * One project's session cards, which drag to a new order among themselves and never leave their
 * rail: press a card and move it, and its siblings slide to open the gap where it would land.
 * Release calls `onReorder` with the ids in their new order; Escape cancels. Each card is a
 * SortableCard.
 */
export function SortableCards(props: {
  ids: string[];
  onReorder: (ids: string[]) => void;
  children: ReactNode;
}) {
  const { ids } = props;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: SLOP } }),
  );
  const drop = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    props.onReorder(moveSession(ids, String(active.id), ids.indexOf(String(over.id))));
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={MODIFIERS}
      onDragEnd={drop}
      // Its screen-reader text lives in body, not between the rail's cards.
      accessibility={{ container: document.body }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {props.children}
      </SortableContext>
    </DndContext>
  );
}

/** A card in SortableCards: raised while dragged, which tints its rail (ProjectSessionsGroup). */
export function SortableCard(props: { id: string; children: ReactNode }) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({
    id: props.id,
  });
  return (
    <div
      ref={setNodeRef}
      data-drag-id={props.id}
      data-dragging={isDragging || undefined}
      // The card inside is the focusable button and its keys move it (Option+Arrow), so the
      // wrapper takes only the pointer listeners, not dnd-kit's tab stop and roles.
      {...listeners}
      className={cn('relative rounded-md', isDragging && 'z-20 scale-[1.02] opacity-95 shadow-lg')}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      {props.children}
    </div>
  );
}
