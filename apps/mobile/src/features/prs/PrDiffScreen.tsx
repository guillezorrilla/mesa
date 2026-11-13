import { Stack } from 'expo-router';
import { Suspense } from 'react';
import { BusyScreen } from '@/components/BusyScreen';
import { pathParts } from '@/lib/pathParts';
import { DiffBody } from '../changes/DiffBody';
import { useDiffPages } from '../changes/useDiffPages';
import { SLOW_MS } from '../mac/slowCall';

/** One file of a PR's diff, paged as it scrolls; read only, as the PR is someone's branch. */
export function PrDiffScreen(props: {
  project: string;
  number: number;
  path: string;
  rev: string;
}) {
  const { first, more, readMore } = useDiffPages((mac, from) =>
    mac.call({ method: 'prDiff', ...props, from }, SLOW_MS),
  );
  return (
    <>
      <Stack.Screen options={{ title: pathParts(props.path).name }} />
      <Suspense fallback={<BusyScreen label="Reading the diff..." />}>
        <DiffBody path={props.path} first={first} more={more} onEnd={readMore} />
      </Suspense>
    </>
  );
}
