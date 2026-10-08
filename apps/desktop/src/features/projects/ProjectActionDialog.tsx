import type { ProjectRow } from '@mesa/core';
import { ProjectLabelDialog } from './ProjectLabelDialog';
import { UnregisterProjectDialog } from './UnregisterProjectDialog';
import type { useProjectActions } from './useProjectActions';

/** The dialog a project action opened: its label to rename, or its unregister to confirm. */
export function ProjectActionDialog(props: {
  project: ProjectRow;
  actions: ReturnType<typeof useProjectActions>;
}) {
  const { project, actions } = props;
  if (actions.dialog === 'label')
    return (
      <ProjectLabelDialog
        label={project.label}
        busy={actions.busy}
        onSave={actions.rename}
        onCancel={actions.close}
      />
    );
  if (actions.dialog === 'unregister')
    return (
      <UnregisterProjectDialog
        label={project.label}
        busy={actions.busy}
        onConfirm={actions.unregister}
        onCancel={actions.close}
      />
    );
  return null;
}
