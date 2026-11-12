import type { PhonePairing } from '@mesa/core/phone';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import { Suspense } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { InfoRow } from '@/components/InfoRow';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { usePushRegistration } from '../push/usePushRegistration';
import { MacSeenLine } from './MacSeenLine';
import { UnpairButton } from './UnpairButton';
import { useMacInfo } from './useMacInfo';
import { usePairing } from './usePairing';

/** Paired: which pairing, when the Mac last checked in, and Unpair. */
export function PairedScreen({ pairing }: { pairing: PhonePairing }) {
  usePushRegistration(pairing);
  const { forget } = usePairing();
  const { info, refresh, checking } = useMacInfo(pairing);
  return (
    <Screen>
      <Card className="gap-4 py-5">
        <CardHeader className="flex-row items-center gap-2 px-5">
          <Icon as={CircleCheck} className="size-5 text-state-idle" />
          <CardTitle className="text-lg">Paired with your Mac</CardTitle>
        </CardHeader>
        <CardContent className="gap-3 px-5">
          <Suspense fallback={<BusyLine label="Asking the broker..." />}>
            <MacSeenLine info={info} />
          </Suspense>
          <Separator />
          <InfoRow label="Pairing" value={pairing.pairingId} />
        </CardContent>
      </Card>
      <View className="gap-2">
        <Button variant="secondary" disabled={checking} onPress={refresh}>
          <Text>{checking ? 'Checking...' : 'Check again'}</Text>
        </Button>
        <UnpairButton onUnpair={forget} />
      </View>
    </Screen>
  );
}
