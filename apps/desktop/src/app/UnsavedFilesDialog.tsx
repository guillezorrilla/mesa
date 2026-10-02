import { ActionDialog } from '@/components/ActionDialog';

/** Asks before leaving a project whose open file has unsaved edits. */
export function UnsavedFilesDialog(props: { onDiscard: () => void; onCancel: () => void }) {
  return (
    <ActionDialog
      testId="file-navigation-dialog"
      title="Discard unsaved file changes?"
      description="Save or discard the open file before leaving this project."
      submit={{
        label: 'Discard changes',
        testId: 'confirm-file-navigation',
        disabled: false,
        variant: 'destructive',
      }}
      onSubmit={props.onDiscard}
      onCancel={props.onCancel}
    >
      <p className="text-sm">Unsaved edits will be lost.</p>
    </ActionDialog>
  );
}
