import type { ProjectRow } from '@mesa/core';
import { ArrowDown, ArrowUp, MoreHorizontal } from 'lucide-react';
import { useState } from 'react';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import type { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { ProjectLabelDialog } from './ProjectLabelDialog';
import { UnregisterProjectDialog } from './UnregisterProjectDialog';

/** A project's own actions: rename its label, pin, hide, reorder, or unregister it. */
export function ProjectActionsMenu(props: {
  project: ProjectRow;
  /** The screen's one action at a time, shared with its other actions. */
  acting: boolean;
  act: ReturnType<typeof useAct>['act'];
  onChanged: () => void;
  onUnregistered: () => void;
}) {
  const { project, acting, act } = props;
  const [dialog, setDialog] = useState<'label' | 'unregister'>();
  const run = useRun();
  const update = (patch: {
    label?: string;
    pinned?: boolean;
    hidden?: boolean;
    move?: 'up' | 'down';
  }) =>
    act(async () => {
      const changed = await run('projects.update', { name: project.name, ...patch });
      if (!changed) return undefined;
      setDialog(undefined);
      props.onChanged();
      return said(`Updated project ${project.name}`, changed);
    });
  const unregister = () =>
    act(async () => {
      const removed = await run('projects.unregister', { name: project.name });
      if (!removed) return undefined;
      setDialog(undefined);
      props.onUnregistered();
      return said(`Unregistered project ${project.name}`, removed);
    });
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
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => setDialog('label')}
          >
            Rename display label
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={acting}
            onClick={() => void update({ pinned: !project.pinned })}
          >
            {project.pinned ? 'Unpin' : 'Pin'} project
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={acting}
            onClick={() => void update({ hidden: !project.hidden })}
          >
            {project.hidden ? 'Show' : 'Hide'} project
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={acting}
            onClick={() => void update({ move: 'up' })}
          >
            <ArrowUp aria-hidden /> Move up
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            disabled={acting}
            onClick={() => void update({ move: 'down' })}
          >
            <ArrowDown aria-hidden /> Move down
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start text-destructive"
            onClick={() => setDialog('unregister')}
          >
            Unregister project
          </Button>
        </div>
      </details>
      {dialog === 'label' && (
        <ProjectLabelDialog
          label={project.label}
          busy={acting}
          onSave={(label) => void update({ label })}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'unregister' && (
        <UnregisterProjectDialog
          label={project.label}
          busy={acting}
          onConfirm={() => void unregister()}
          onCancel={() => setDialog(undefined)}
        />
      )}
    </>
  );
}
