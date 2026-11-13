import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { PrBody } from './PrBody';
import { usePr } from './usePr';

/** One pull request: its checks and merge, review, description, my threads and drafts, files. */
export function PrScreen({ project, number }: { project: string; number: number }) {
  const { answer, pull, refreshing, actions } = usePr(project, number);
  return (
    <>
      <Stack.Screen options={{ title: `#${number}` }} />
      <Suspense fallback={<BusyScreen label="Reading the pull request..." />}>
        <PrBody answer={answer} refreshing={refreshing} onRefresh={pull} actions={actions} />
      </Suspense>
    </>
  );
}
