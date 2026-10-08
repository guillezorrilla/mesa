import type { ProjectRow } from '@mesa/core';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { useAct } from '@/lib/useAct';
import { cn } from '@/lib/utils';
import { ProjectActionDialog } from './ProjectActionDialog';
import { useProjectActions } from './useProjectActions';

/** The project screen's actions menu: rename its label, pin, hide, reorder, or unregister it. */
export function ProjectActionsMenu(props: {
  project: ProjectRow;
  /** The screen's one action at a time, shared with its other actions. */
  acting: boolean;
  act: ReturnType<typeof useAct>['act'];
  onChanged: () => void;
  onUnregistered: () => void;
}) {
  const menu = useProjectActions(props);
  return (
    <>
      <details className="relative">
        <summary
          data-testid="project-menu"
          aria-label="Project actions"
          className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <MoreHorizontal aria-hidden className="size-4" />
        </summary>
        <div className="absolute right-0 z-20 mt-1 grid w-48 gap-1 rounded-md border bg-popover p-1 shadow-lg">
          {menu.actions.map((action) => (
            <Button
              key={action.label}
              variant="ghost"
              size="sm"
              className={cn('justify-start', action.destructive && 'text-destructive')}
              disabled={action.disabled}
              onClick={action.onSelect}
            >
              {action.icon && <action.icon aria-hidden />}
              {action.label}
            </Button>
          ))}
        </div>
      </details>
      <ProjectActionDialog project={props.project} actions={menu} />
    </>
  );
}
