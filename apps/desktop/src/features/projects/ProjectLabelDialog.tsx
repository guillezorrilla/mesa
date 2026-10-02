import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Renames a project's display label; its slug stays. */
export function ProjectLabelDialog(props: {
  label: string;
  busy: boolean;
  onSave: (label: string) => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="project-label-dialog"
      title="Rename display label"
      description="The project slug and historical session links stay the same."
      submit={{ label: 'Save label', testId: 'save-project-label', disabled: props.busy }}
      onSubmit={(form) => props.onSave(String(new FormData(form).get('label') ?? ''))}
      onCancel={props.onCancel}
    >
      <Label htmlFor="project-label">Label</Label>
      <Input id="project-label" name="label" defaultValue={props.label} required maxLength={80} />
    </ActionDialog>
  );
}
