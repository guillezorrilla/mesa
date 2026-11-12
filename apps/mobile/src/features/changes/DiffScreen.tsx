import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { DiffBody } from './DiffBody';
import { useDiff } from './useDiff';

/** One changed file's diff, paged as it scrolls, with notes on its lines to the agent. */
export function DiffScreen({ id, path }: { id: string; path: string }) {
  const { first, more, readMore, selection, tap } = useDiff(id, path);
  return (
    <>
      <Stack.Screen options={{ title: path.split('/').pop() ?? path }} />
      <Suspense fallback={<BusyScreen label="Reading the diff..." />}>
        <DiffBody
          id={id}
          path={path}
          first={first}
          more={more}
          onEnd={readMore}
          selection={selection}
          onTap={tap}
        />
      </Suspense>
    </>
  );
}
