import { router } from 'expo-router';
import Info from 'lucide-react-native/icons/info';
import Plus from 'lucide-react-native/icons/plus';
import { LinkRow } from '@/components/LinkRow';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { TabHeader } from '@/components/TabHeader';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HapticsSection } from '../haptics/HapticsSection';
import { PushesSection } from '../pushes/PushesSection';
import { MacCard } from './MacCard';
import { usePairing } from './usePairing';

/** The Settings tab once paired: each paired Mac, pairing another, this phone's settings, About. */
export function MacsScreen() {
  const { pairings } = usePairing();
  return (
    <Screen header={<TabHeader title="Settings" />}>
      <Section title={pairings.length > 1 ? 'Paired Macs' : 'Paired Mac'}>
        {pairings.map((pairing) => (
          <MacCard key={pairing.pairingId} pairing={pairing} />
        ))}
        <Button variant="outline" onPress={() => router.push('/pair')}>
          <Icon as={Plus} className="size-4 text-foreground" />
          <Text>Pair another Mac</Text>
        </Button>
      </Section>
      <PushesSection />
      <HapticsSection />
      <Section title="Appearance">
        <Text variant="muted">Light or dark follows your iPhone's setting.</Text>
      </Section>
      <LinkRow
        icon={Info}
        title="About"
        line="Version, build and update"
        onPress={() => router.push('/about')}
      />
    </Screen>
  );
}
