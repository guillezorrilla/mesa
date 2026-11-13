import { router } from 'expo-router';
import Info from 'lucide-react-native/icons/info';
import { HeaderButton } from '@/components/HeaderButton';
import { TabHeader } from '@/components/TabHeader';
import { TabScreen } from '@/components/TabScreen';
import { MacsScreen } from '@/features/pairing/MacsScreen';
import { PairScreen } from '@/features/pairing/PairScreen';
import { usePairing } from '@/features/pairing/usePairing';

/** Settings: the paired Macs when there is one, else how to pair one under Mesa's name and About. */
export default function Home() {
  const { pairing } = usePairing();
  const unpaired = (
    <TabHeader title="Mesa">
      <HeaderButton icon={Info} label="About Mesa" onPress={() => router.push('/about')} />
    </TabHeader>
  );
  return <TabScreen>{pairing ? <MacsScreen /> : <PairScreen header={unpaired} />}</TabScreen>;
}
