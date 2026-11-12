import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { pathParts } from '@/lib/pathParts';
import { DiffBody } from './DiffBody';
import { useDiff } from './useDiff';

/** One changed file's diff, paged as it scrolls, with notes on its lines to the agent. */
export function DiffScreen({ id, path, rev }: { id: string; path: string; rev: string }) {
  const { first, more, readMore, selection, tap, sendNote } = useDiff(id, path, rev);
  return (
    <>
      <Stack.Screen options={{ title: pathParts(path).name }} />
      <Suspense fallback={<BusyScreen label="Reading the diff..." />}>
        <DiffBody
          path={path}
          first={first}
          more={more}
          onEnd={readMore}
          selection={selection}
          onTap={tap}
          onNote={sendNote}
        />
      </Suspense>
    </>
  );
}
