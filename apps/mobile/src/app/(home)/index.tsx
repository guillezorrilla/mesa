import { TabHeader } from '@/components/TabHeader';
import { TabScreen } from '@/components/TabScreen';
import { MacsScreen } from '@/features/pairing/MacsScreen';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** Settings: the paired Macs when there is one, else how to pair one, under Mesa's name. */
export default function Home() {
  const { pairing } = usePairing();
  return (
    <TabScreen>
      {pairing ? <MacsScreen /> : <PairScreen header={<TabHeader title="Mesa" />} />}
    </TabScreen>
  );
}
