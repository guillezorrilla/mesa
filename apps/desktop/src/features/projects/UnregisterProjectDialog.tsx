import { ActionDialog } from '@/components/ActionDialog';

/** Confirms removing a project from this profile; its folder and history stay. */
export function UnregisterProjectDialog(props: {
  label: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="project-unregister-dialog"
      title="Unregister project?"
      description="This removes the project from this profile. It leaves the folder, mesa.yaml, and session history intact."
      submit={{
        label: 'Unregister',
        testId: 'confirm-unregister-project',
        disabled: props.busy,
        variant: 'destructive',
      }}
      onSubmit={props.onConfirm}
      onCancel={props.onCancel}
    >
      <p className="text-sm">{props.label}</p>
    </ActionDialog>
  );
}
