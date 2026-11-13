import { router } from 'expo-router';
import Plus from 'lucide-react-native/icons/plus';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { HapticsSection } from '../haptics/HapticsSection';
import { PushesSection } from '../pushes/PushesSection';
import { UsageLink } from '../usage/UsageLink';
import { MacCard } from './MacCard';
import { usePairing } from './usePairing';

/** The Mac tab once paired: each paired Mac, pairing another, usage, and this phone's settings. */
export function MacsScreen() {
  const { pairings } = usePairing();
  return (
    <Screen>
      <Section title={pairings.length > 1 ? 'Paired Macs' : 'Paired Mac'}>
        {pairings.map((pairing) => (
          <MacCard key={pairing.pairingId} pairing={pairing} />
        ))}
        <Button variant="outline" onPress={() => router.push('/pair')}>
          <Icon as={Plus} className="size-4 text-foreground" />
          <Text>Pair another Mac</Text>
        </Button>
      </Section>
      <UsageLink />
      <PushesSection />
      <HapticsSection />
      <Section title="Appearance">
        <Text variant="muted">Light or dark follows your iPhone's setting.</Text>
      </Section>
    </Screen>
  );
}
