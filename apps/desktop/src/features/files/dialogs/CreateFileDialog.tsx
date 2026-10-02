import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Asks for the path of a new file in an existing folder of the checkout. */
export function CreateFileDialog(props: {
  busy: boolean;
  onCreate: (path: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="file-create-dialog"
      title="Create file"
      description="Create one file in an existing folder of this checkout."
      submit={{ label: 'Create', testId: 'confirm-file-create', disabled: props.busy }}
      onCancel={props.onCancel}
      onSubmit={(form) => props.onCreate(String(new FormData(form).get('path') ?? ''))}
    >
      <Label htmlFor="new-file-path">Repository-relative path</Label>
      <Input id="new-file-path" name="path" required placeholder="docs/notes.md" />
    </ActionDialog>
  );
}
