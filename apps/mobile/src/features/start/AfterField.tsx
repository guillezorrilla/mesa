import type { PhoneRow } from '@mesa/core/phone';
import { use } from 'react';
import { ChoiceChips } from '@/components/ChoiceChips';
import { FormField } from '@/components/FormField';

/** At once, or queued until one of the project's open sessions is over (`--after`). */
export function AfterField({
  sessions,
  project,
  value,
  onChange,
}: {
  sessions: Promise<PhoneRow[]>;
  project?: string;
  value: string;
  onChange: (after: string, title?: string) => void;
}) {
  const open = use(sessions).filter((row) => row.project === project);
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
