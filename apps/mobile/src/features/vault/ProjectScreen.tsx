import { router, Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { useMacRead } from '../mac/useMacRead';
import { ProjectBody } from './ProjectBody';

/** One project's memory, with a bar button that saves a decision for it. */
export function ProjectScreen({ name }: { name: string }) {
  const { answer: read } = useMacRead({ method: 'project', name });
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
