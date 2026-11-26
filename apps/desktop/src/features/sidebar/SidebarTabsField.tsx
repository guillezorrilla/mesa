import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { SidebarTab } from '@mesa/core/browser';
import { GripVertical, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SIDEBAR_TAB_ICONS } from './sidebarTabIcons';
import type { SidebarTabsSettings } from './useSidebarTabs';

const MODIFIERS = [restrictToVerticalAxis, restrictToParentElement];
const ROW = 'flex h-8 items-center gap-2 rounded-md px-1 text-sm';
/** A small switch, sized for a list row. */
const SMALL_SWITCH = 'h-5 w-9 [&>span]:size-4';

/**
 * Each tab with a switch: Sessions and Projects locked on, the optional ones that drag (or move by
 * keyboard from their handle) to a new order.
 */
export function SidebarTabsField(props: { settings: SidebarTabsSettings }) {
  const { tabs, setShown, setOrder } = props.settings;
  const fixed = tabs.filter((tab) => tab.fixed);
  const optional = tabs.filter((tab) => !tab.fixed);
  const ids: string[] = optional.map((tab) => tab.id);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const drop = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    void setOrder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return (
    <ul aria-label="Sidebar tabs" className="grid gap-0.5">
      {fixed.map((tab) => (
        <li key={tab.id} className={ROW}>
          <span className="flex size-6 items-center justify-center text-muted-foreground/60">
            <Lock aria-hidden className="size-3" />
          </span>
          <TabName tab={tab} />
          <Switch
            checked
            disabled
            aria-label={`${tab.label} always shows`}
            className={cn(SMALL_SWITCH, 'ml-auto')}
          />
        </li>
      ))}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={MODIFIERS}
        onDragEnd={drop}
        accessibility={{ container: document.body }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {optional.map((tab) => (
            <SortableRow key={tab.id} tab={tab}>
              <Switch
                checked={tab.shown}
                onCheckedChange={(on) => void setShown(tab.id, on)}
                aria-label={`Show ${tab.label}`}
                className={cn(SMALL_SWITCH, 'ml-auto')}
              />
            </SortableRow>
          ))}
        </SortableContext>
      </DndContext>
    </ul>
  );
}

function TabName(props: { tab: SidebarTab }) {
  const Icon = SIDEBAR_TAB_ICONS[props.tab.id];
  return (
    <span className={cn('flex items-center gap-2', !props.tab.shown && 'text-muted-foreground')}>
      <Icon aria-hidden className="size-3.5 shrink-0" />
      {props.tab.label}
    </span>
  );
}

/** An optional tab's row, dragged by its handle. */
function SortableRow(props: { tab: SidebarTab; children: ReactNode }) {
  const {
    setNodeRef,
    setActivatorNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.tab.id });
  return (
    <li
      ref={setNodeRef}
      data-drag-id={props.tab.id}
      className={cn(ROW, isDragging && 'relative z-10 bg-popover shadow-md ring-1 ring-border')}
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Move ${props.tab.label}`}
        className="flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing"
      >
        <GripVertical aria-hidden className="size-3.5" />
      </button>
      <TabName tab={props.tab} />
      {props.children}
    </li>
  );
}
