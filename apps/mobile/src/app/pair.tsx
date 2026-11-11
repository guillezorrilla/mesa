import { Redirect, useLocalSearchParams } from 'expo-router';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** `mesa://pair?...`, which the system opens when the Camera app reads the Mac's code. */
export default function PairLink() {
  const { pairing } = usePairing();
  const params = useLocalSearchParams<Record<string, string>>();
  if (pairing) return <Redirect href="/" />;
  return <PairScreen link={`mesa://pair?${new URLSearchParams(params)}`} />;
}
