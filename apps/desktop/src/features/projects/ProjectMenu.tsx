import type { ProjectRow } from '@mesa/core';
import type { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { useAct } from '@/lib/useAct';
import { useProjectActions } from './useProjectActions';

/** A sidebar project's right-click menu, with the project screen's actions. */
export function ProjectMenu(props: {
  project: ProjectRow;
  onChanged: () => void;
  onUnregistered: () => void;
  /** The project's row. */
  children: ReactNode;
}) {
  const { acting, act } = useAct();
  const { actions, dialogs } = useProjectActions({ ...props, acting, act });
  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{props.children}</ContextMenuTrigger>
        <ContextMenuContent>
          {actions.map((action) => (
            <ContextMenuItem
              key={action.label}
              variant={action.destructive ? 'destructive' : 'default'}
              disabled={action.disabled}
              onSelect={action.onSelect}
            >
              {action.icon && <action.icon aria-hidden />}
              {action.label}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
      </ContextMenu>
      {dialogs}
    </>
  );
}
