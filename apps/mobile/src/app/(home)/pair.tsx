import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** `mesa://pair?...`, which the system opens when the Camera app reads the Mac's code. */
export default function PairLink() {
  const { pairing } = usePairing();
  const params = useLocalSearchParams<Record<string, string>>();
  // Back to home rather than a second home on top of this screen (a Redirect replaces only this one).
  useEffect(() => {
    if (pairing) router.dismissTo('/');
  }, [pairing]);
  if (pairing) return null;
  return <PairScreen link={`mesa://pair?${new URLSearchParams(params)}`} />;
}
