import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import { DecisionForm } from './DecisionForm';
import type { VaultRead } from './useVaultRead';

/** The decision form over the Mac's projects, or why there is none to save one for. */
export function DecideBody({
  read,
  project,
}: {
  read: Promise<VaultRead<'projects'>>;
  project?: string;
}) {
  const { result, error } = use(read);
  const projects = result?.projects ?? [];
  return (
    <Screen className="gap-5">
      <Text variant="muted">
        Kept in wiki/decisions/ with a receipt, as mesa vault save decision keeps it.
      </Text>
      {error ? <ErrorNote text={error} /> : null}
      {result && !projects.length ? (
        <Text variant="muted">No projects on the Mac yet. A decision belongs to one.</Text>
      ) : null}
      {projects.length ? (
        <DecisionForm projects={projects} project={project ?? projects[0]?.name ?? ''} />
      ) : null}
    </Screen>
  );
}
