import { router, Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { ChangesList } from '../changes/ChangesList';
import { usePrFiles } from './usePrFiles';

/** What a PR changed, file by file, in the Changes viewer. */
export function PrFilesScreen({ project, number }: { project: string; number: number }) {
  const { answer, pull, refreshing, seen, toggleViewed } = usePrFiles(project, number);
  return (
    <>
      <Stack.Screen options={{ title: 'Files changed' }} />
      <Suspense fallback={<BusyScreen label="Reading the diff..." />}>
        <ChangesList
          onOpen={(file) =>
            router.push({
              pathname: '/work/pr-diff',
              params: { project, number: String(number), path: file.path, rev: file.rev },
            })
          }
          answer={answer}
          refreshing={refreshing}
          onRefresh={pull}
          seen={seen}
          onToggleViewed={toggleViewed}
        />
      </Suspense>
    </>
  );
}
