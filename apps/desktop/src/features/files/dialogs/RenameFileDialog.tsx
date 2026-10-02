import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Asks for the open file's new path, which must not replace another file. */
export function RenameFileDialog(props: {
  path: string;
  busy: boolean;
  onRename: (path: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="file-rename-dialog"
      title="Rename file"
      description={`Rename ${props.path} without replacing another file.`}
      submit={{ label: 'Rename', testId: 'confirm-file-rename', disabled: props.busy }}
      onCancel={props.onCancel}
      onSubmit={(form) => props.onRename(String(new FormData(form).get('path') ?? ''))}
    >
      <Label htmlFor="rename-file-path">New repository-relative path</Label>
      <Input id="rename-file-path" name="path" defaultValue={props.path} required />
    </ActionDialog>
  );
}
