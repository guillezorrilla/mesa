import { Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

/** A session card's right-click menu, which archives the selected sessions together. */
export function SessionsMenu(props: {
  /** How many sessions are selected once the right-click has chosen. */
  count: number;
  /** The right-click, before the menu opens: it may change the selection. */
  onOpen: () => void;
  onArchive: () => void;
  /** The card. */
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={props.onOpen}>
        <div>{props.children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={props.onArchive}>
          <Archive aria-hidden />
          {props.count === 1 ? 'Archive session' : `Archive ${props.count} sessions`}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
