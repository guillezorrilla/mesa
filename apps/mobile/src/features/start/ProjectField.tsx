import { use } from 'react';
import { ChoiceChips } from '@/components/ChoiceChips';
import { FormField } from '@/components/FormField';
import { Text } from '@/components/ui/text';
import type { Projects } from '../projects/useProjects';

/** The project to start on, one chip per project on the Mac. */
export function ProjectField({
  projects,
  value,
  onChange,
}: {
  projects: Promise<Projects>;
  value?: string;
  onChange: (project: string) => void;
}) {
  const listed = use(projects);
  return (
    <FormField label="Project">
      {listed.length ? (
        <ChoiceChips
          label="Project"
          choices={listed.map((p) => [p.name, p.label] as const)}
          value={value}
          onChange={onChange}
        />
      ) : (
        <Text variant="muted">Your Mac lists no projects, or did not answer.</Text>
      )}
    </FormField>
  );
}
