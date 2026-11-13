import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ErrorNote } from '@/components/ErrorNote';
import { FormField } from '@/components/FormField';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';

/** The project to start on, one chip per project on the Mac; only `value`'s when `locked`. */
export function ProjectField({
  projects,
  value,
  locked,
  onChange,
}: {
  projects: Promise<MacRead<CallResult<'projects'>>>;
  value?: string;
  /** Starting from a ticket, the project whose Tickets list it is. */
  locked: boolean;
  onChange: (project: string) => void;
}) {
  const { result, error } = use(projects);
  const listed = (result?.projects ?? []).filter((p) => !locked || p.name === value);
  return (
    <FormField label="Project">
      {error ? <ErrorNote text={error} /> : null}
      {listed.length ? (
        <ChoiceChips
          label="Project"
          choices={listed.map((p) => [p.name, p.label] as const)}
          value={value}
          onChange={onChange}
        />
      ) : error ? null : (
        <Text variant="muted">Your Mac lists no projects.</Text>
      )}
    </FormField>
  );
}
