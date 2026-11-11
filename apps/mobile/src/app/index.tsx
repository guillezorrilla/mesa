import { PairedScreen } from '@/features/pairing/PairedScreen';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** Home: the pairing when there is one, else how to make one. */
export default function Home() {
  const { pairing } = usePairing();
  return pairing ? <PairedScreen pairing={pairing} /> : <PairScreen />;
}
