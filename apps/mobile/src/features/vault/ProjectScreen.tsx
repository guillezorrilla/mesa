import { router, Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { ProjectBody } from './ProjectBody';
import { useVaultRead } from './useVaultRead';

/** One project's memory, with a bar button that saves a decision for it. */
export function ProjectScreen({ name }: { name: string }) {
  const read = useVaultRead({ method: 'project', name });
  return (
    <>
      <Stack.Screen options={{ title: name }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="square.and.pencil"
          accessibilityLabel="Save a decision"
          onPress={() => router.push({ pathname: '/vault/decide', params: { project: name } })}
        />
      </Stack.Toolbar>
      <Suspense fallback={<BusyScreen label="Reading the project..." />}>
        <ProjectBody read={read} />
      </Suspense>
    </>
  );
}
