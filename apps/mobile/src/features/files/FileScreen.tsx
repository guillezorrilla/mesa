import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { Screen } from '@/components/Screen';
import { useMacRead } from '../mac/useMacRead';
import { FileBody } from './FileBody';
import { nameOf } from './folderEntries';

/** One file of a session's worktree, read-only. */
export function FileScreen({ id, path }: { id: string; path: string }) {
  const { answer } = useMacRead({ method: 'file', id, path });
  return (
    <Screen>
      <Stack.Screen options={{ title: nameOf(path) }} />
      <Suspense fallback={<BusyLine label="Reading the file..." />}>
        <FileBody path={path} file={answer} />
      </Suspense>
    </Screen>
  );
}
