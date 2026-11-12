import { router } from 'expo-router';
import { use } from 'react';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { TodayCard } from './TodayCard';
import type { VaultRead } from './useVaultRead';
import { VaultRow } from './VaultRow';

/** The Vault tab before a search: today's digest, then each project's memory. */
export function VaultHome({ read }: { read: Promise<VaultRead<'projects'>> }) {
  const { result, error } = use(read);
  const projects = result?.projects ?? [];
  return (
    <Screen className="gap-6">
      <TodayCard />
      {error ? <ErrorNote text={error} /> : null}
      <Section title="Projects">
        {result && !projects.length ? (
          <Text variant="muted">No projects on the Mac yet.</Text>
        ) : null}
        <View>
          {projects.map((project, i) => (
            <VaultRow
              key={project.name}
              title={project.label}
              first={i === 0}
              onPress={() =>
                router.push({ pathname: '/vault/project/[name]', params: { name: project.name } })
              }
            />
          ))}
        </View>
      </Section>
    </Screen>
  );
}
