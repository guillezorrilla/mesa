import type { ProjectRow } from '@mesa/core';
import { ArrowDown, ArrowUp, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { warningOf } from '@/components/Toast';
import type { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

export type ProjectAction = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/**
 * A project's own actions, rename its label, pin, hide, reorder, or unregister it, for any menu
 * to list, and the dialog the one it chose opens, for ProjectActionDialog to show.
 */
export function useProjectActions(props: {
  project: ProjectRow;
  /** One action at a time, shared with the caller's other actions. */
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
      return warningOf(changed);
    });
  const unregister = () =>
    act(async () => {
      const removed = await run('projects.unregister', { name: project.name });
      if (!removed) return undefined;
      setDialog(undefined);
      props.onUnregistered();
      return warningOf(removed);
    });
  const actions: ProjectAction[] = [
    { label: 'Rename display label', onSelect: () => setDialog('label') },
    {
      label: `${project.pinned ? 'Unpin' : 'Pin'} project`,
      disabled: acting,
      onSelect: () => void update({ pinned: !project.pinned }),
    },
    {
      label: `${project.hidden ? 'Show' : 'Hide'} project`,
      disabled: acting,
      onSelect: () => void update({ hidden: !project.hidden }),
    },
    {
      label: 'Move up',
      icon: ArrowUp,
      disabled: acting,
      onSelect: () => void update({ move: 'up' }),
    },
    {
      label: 'Move down',
      icon: ArrowDown,
      disabled: acting,
      onSelect: () => void update({ move: 'down' }),
    },
    { label: 'Unregister project', destructive: true, onSelect: () => setDialog('unregister') },
  ];
  return {
    actions,
    dialog,
    busy: acting,
    rename: (label: string) => void update({ label }),
    unregister: () => void unregister(),
    close: () => setDialog(undefined),
  };
}
