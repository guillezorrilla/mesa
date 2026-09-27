import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Names a session: the Board and `mesa sessions` show the name in place of its id. */
export function RenameDialog(props: {
  sessionId: string;
  name?: string;
  disabled: boolean;
  onRename: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="rename-dialog"
      title={`Rename ${props.sessionId}`}
      description="The Board shows the name in place of the id."
      submit={{ label: 'Rename', testId: 'rename-submit', disabled: props.disabled }}
      onSubmit={(form) => props.onRename(String(new FormData(form).get('name') ?? ''))}
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="rename-name">Name</Label>
        <Input
          id="rename-name"
          name="name"
          data-testid="rename-name"
          defaultValue={props.name}
          required
        />
      </div>
    </ActionDialog>
  );
}
