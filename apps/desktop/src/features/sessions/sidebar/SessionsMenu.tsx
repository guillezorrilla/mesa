import { Archive } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { MarkUnreadItem } from './MarkUnreadItem';

/**
 * A session card's right-click menu, which archives the selected sessions together, and marks a
 * Mesa session's card (with the selected ones) unread or read.
 */
export function SessionsMenu(props: {
  /** How many sessions are selected once the right-click has chosen. */
  count: number;
  /** The right-click, before the menu opens: it may change the selection. */
  onOpen: () => void;
  onArchive: () => void;
  /** Whether the card shows unread. */
  unread: boolean;
  /** A Mesa session's card marks unread or read; a foreign one's has no such item. */
  onMark?: (unread: boolean) => void;
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
        {props.onMark && (
          <ContextMenuItem onSelect={() => props.onMark?.(!props.unread)}>
            <MarkUnreadItem unread={props.unread} count={props.count} />
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
