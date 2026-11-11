import { ListChecks } from 'lucide-react';
import { TextField } from '../controls/TextField';
import { SettingRow } from '../SettingRow';

/** An empty command leaves `check` out of mesa.yaml: the project has none. */
const command = (text: string) => ({ value: text.trim() || undefined });

/** The project's `check` (CONTEXT.md, Check): the shell command `mesa check` runs for its agents. */
export function CheckRow(props: { value: string | undefined; onSave: (value: unknown) => void }) {
  return (
    <SettingRow
      icon={ListChecks}
      title="Check command"
      description="A shell command, such as pnpm verify. mesa check runs it and gives the agent one line when it passes, or only the errors and the log path when it fails. Empty, the project has no check."
      keywords="project check verify test build lint"
      htmlFor="project-check-command"
    >
      <TextField
        id="project-check-command"
        value={props.value ?? ''}
        placeholder="pnpm verify"
        parse={command}
        onSave={props.onSave}
      />
    </SettingRow>
  );
}
