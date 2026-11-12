import { use, useState } from 'react';
import { View } from 'react-native';
import { ChoiceChips } from '@/components/ChoiceChips';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import type { Projects } from '../projects/useProjects';
import { ProjectTickets } from './ProjectTickets';

/** The projects as chips over the chosen one's tickets, the most recently worked on first. */
export function TicketsBody({ projects }: { projects: Promise<Projects> }) {
  const listed = use(projects);
  const [project, setProject] = useState(listed[0]?.name);
  if (!project)
    return (
      <Screen>
        <Text variant="muted">Your Mac lists no projects, or did not answer.</Text>
      </Screen>
    );
  const chips = (
    <View className="px-4 pt-2 pb-3">
      <ChoiceChips
        label="Project"
        choices={listed.map((p) => [p.name, p.label] as const)}
        value={project}
        onChange={setProject}
      />
    </View>
  );
  return <ProjectTickets key={project} project={project} header={chips} />;
}
