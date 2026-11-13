import { router, useLocalSearchParams } from 'expo-router';
import { PairScreen } from '@/features/pairing/PairScreen';

/**
 * Pairing another Mac, from Pair another Mac or from `mesa://pair?...`, which the system opens
 * when the Camera app reads a Mac's code; back to the paired Macs once paired.
 */
export default function PairLink() {
  const params = useLocalSearchParams<Record<string, string>>();
  const link = params.p ? `mesa://pair?${new URLSearchParams(params)}` : undefined;
  return <PairScreen link={link} onPaired={() => router.dismissTo('/')} />;
}
