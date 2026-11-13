import type { CallResult } from '@mesa/core/phone';
import { type ReactNode, use, useState } from 'react';
import { View } from 'react-native';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { ProjectTickets } from './ProjectTickets';

/**
 * The projects as chips over the chosen one's tickets, the most recently worked on first, all
 * under `header`.
 */
export function TicketsBody({
  projects,
  header,
}: {
  projects: Promise<MacRead<CallResult<'projects'>>>;
  header?: ReactNode;
}) {
  const { result, error } = use(projects);
  const listed = result?.projects ?? [];
  const [project, setProject] = useState(listed[0]?.name);
  if (!project)
    return (
      <Screen header={header}>
        {error ? (
          <ErrorNote text={error} />
        ) : (
          <Text variant="muted">Your Mac lists no projects.</Text>
        )}
      </Screen>
    );
  const chips = (
    <>
      {header}
      <View className="px-4 pt-2 pb-3">
        <ChoiceChips
          label="Project"
          choices={listed.map((p) => [p.name, p.label] as const)}
          value={project}
          onChange={setProject}
        />
      </View>
    </>
  );
  return <ProjectTickets key={project} project={project} header={chips} />;
}
