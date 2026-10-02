import { ActionDialog } from '@/components/ActionDialog';

/** Asks before a navigation drops the open file's unsaved draft. */
export function DiscardFileDialog(props: {
  path?: string;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="file-discard-dialog"
      title="Discard unsaved changes?"
      description="Your edits to this file have not been saved."
      submit={{
        label: 'Discard changes',
        testId: 'confirm-file-discard',
        disabled: false,
        variant: 'destructive',
      }}
      onCancel={props.onCancel}
      onSubmit={props.onDiscard}
    >
      <p className="font-mono text-sm">{props.path}</p>
    </ActionDialog>
  );
}
