import { ActionDialog } from '@/components/ActionDialog';

/** Confirms deleting the open file from the checkout. */
export function DeleteFileDialog(props: {
  path: string;
  busy: boolean;
  onDelete: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="file-delete-dialog"
      title="Delete file?"
      description={`Delete ${props.path} from this checkout. This cannot be undone in Mesa.`}
      submit={{
        label: 'Delete',
        testId: 'confirm-file-delete',
        disabled: props.busy,
        variant: 'destructive',
      }}
      onCancel={props.onCancel}
      onSubmit={props.onDelete}
    >
      <p className="font-mono text-sm">{props.path}</p>
    </ActionDialog>
  );
}
