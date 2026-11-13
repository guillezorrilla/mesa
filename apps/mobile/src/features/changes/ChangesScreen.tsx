import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { ChangesList } from './ChangesList';
import { useChanges } from './useChanges';

/** What a session changed, file by file, each marked viewed or not. */
export function ChangesScreen({ id }: { id: string }) {
  const { answer, again, refreshing, seen, toggleViewed } = useChanges(id);
  return (
    <>
      <Stack.Screen options={{ title: 'Changes' }} />
      <Suspense fallback={<BusyScreen label="Asking your Mac..." />}>
        <ChangesList
          id={id}
          answer={answer}
          refreshing={refreshing}
          onRefresh={again}
          seen={seen}
          onToggleViewed={toggleViewed}
        />
      </Suspense>
    </>
  );
}
