import { GENERAL_PROJECT } from '@mesa/core/browser';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useCommand } from '@/lib/useCommand';

/**
 * Which registered project a session from the Logs tab starts in: General unless `initial`
 * names one. With `remember`, it offers to keep the choice for that service (Fix in session).
 */
export function CloudProjectDialog(props: {
  title: string;
  description: string;
  initial?: string;
  remember?: string;
  onPick: (project: string, remember: boolean) => void;
  onCancel: () => void;
}) {
  const projects = useCommand('projects.list');
  const [project, setProject] = useState(props.initial ?? GENERAL_PROJECT);
  const [remember, setRemember] = useState(true);
  return (
    <ActionDialog
      testId="cloud-project-dialog"
      title={props.title}
      description={props.description}
      submit={{ label: 'Start session', testId: 'confirm-cloud-project', disabled: false }}
      onSubmit={() => props.onPick(project, Boolean(props.remember) && remember)}
      onCancel={props.onCancel}
    >
      <div className="grid gap-3">
        <NativeSelect
          aria-label="Project"
          value={project}
          onChange={(event) => setProject(event.currentTarget.value)}
        >
          <NativeSelectOption value={GENERAL_PROJECT}>General</NativeSelectOption>
          {projects.data?.map((row) => (
            <NativeSelectOption key={row.name} value={row.name}>
              {row.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {props.remember && (
          <Label className="gap-2 text-xs font-normal text-muted-foreground">
            <Checkbox checked={remember} onCheckedChange={(on) => setRemember(on === true)} />
            Use this project for {props.remember} from now on
          </Label>
        )}
      </div>
    </ActionDialog>
  );
}
