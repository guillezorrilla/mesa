import { AddProjectDialog } from './AddProjectDialog';
import type { ProjectAddRequest } from './AddProjectMenu';
import { DiscoveryDialog } from './DiscoveryDialog';
import { ImportWorkspaceDialog } from './ImportWorkspaceDialog';

const DIALOGS = {
  local: AddProjectDialog,
  import: ImportWorkspaceDialog,
  discover: DiscoveryDialog,
};

/** The dialog an Add project choice opens: a local folder, a workspace import, or Find from sessions. */
export function ProjectAddDialog(props: {
  request: ProjectAddRequest;
  onCancel: () => void;
  onRegistered: () => Promise<void>;
}) {
  const Dialog = DIALOGS[props.request.kind];
  return (
    <Dialog
      onCancel={props.onCancel}
      onRegistered={props.onRegistered}
      returnFocus={props.request.returnFocus}
    />
  );
}
