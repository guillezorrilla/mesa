import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { DecisionForm } from './DecisionForm';

/** The decision form over the Mac's projects, or why there is none to save one for. */
export function DecideBody({
  read,
  project,
}: {
  read: Promise<MacRead<CallResult<'projects'>>>;
  project?: string;
}) {
  const { result, error } = use(read);
  const projects = result?.projects ?? [];
  if (projects.length)
    return <DecisionForm projects={projects} project={project ?? projects[0]?.name ?? ''} />;
  return (
    <Screen>
      {error ? <ErrorNote text={error} /> : null}
      {result ? (
        <Text variant="muted">No projects on the Mac yet. A decision belongs to one.</Text>
      ) : null}
    </Screen>
  );
}
