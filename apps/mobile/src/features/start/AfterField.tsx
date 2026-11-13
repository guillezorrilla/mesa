import { type CallResult, FINAL_STATES } from '@mesa/core/phone';
import { use } from 'react';
import { ChoiceChips } from '@/components/ChoiceChips';
import { FormField } from '@/components/FormField';
import type { MacRead } from '../mac/tryCall';

/** At once, or queued until one of the project's open sessions is over (`--after`). */
export function AfterField({
  sessions,
  project,
  value,
  onChange,
}: {
  sessions: Promise<MacRead<CallResult<'sessions'>>>;
  project?: string;
  value: string;
  onChange: (after: string, title?: string) => void;
}) {
  const rows = use(sessions).result?.rows ?? [];
  const open = rows.filter(
    (row) => row.project === project && !(FINAL_STATES as ReadonlySet<string>).has(row.state),
  );
  if (!open.length) return null;
  const choices = [['none', 'Now'] as const, ...open.map((row) => [row.id, row.title] as const)];
  return (
    <FormField label="Start" hint="Queued until the session you pick is over.">
      <ChoiceChips
        label="Start after"
        choices={choices}
        value={value}
        onChange={(after) => onChange(after, open.find((row) => row.id === after)?.title)}
      />
    </FormField>
  );
}
