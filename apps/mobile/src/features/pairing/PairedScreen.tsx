import type { PhonePairing } from '@mesa/core/phone';
import { Suspense } from 'react';
import { InfoRow } from '@/components/InfoRow';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { usePushRegistration } from '../push/usePushRegistration';
import { MacSeenLine } from './MacSeenLine';
import { UnpairDialog } from './UnpairDialog';
import { useMacInfo } from './useMacInfo';
import { usePairing } from './usePairing';

/** Paired: which pairing, when the Mac last checked in, and Unpair. */
export function PairedScreen({ pairing }: { pairing: PhonePairing }) {
  usePushRegistration(pairing);
  const { forget } = usePairing();
  const { info, refresh } = useMacInfo(pairing);
  return (
    <Screen>
      <Card>
        <CardHeader>
          <CardTitle>Paired with your Mac</CardTitle>
        </CardHeader>
        <CardContent className="gap-2">
          <Suspense fallback={<Text className="text-muted-foreground">Asking the broker...</Text>}>
            <MacSeenLine info={info} />
          </Suspense>
          <InfoRow label="Pairing" value={pairing.pairingId} />
        </CardContent>
      </Card>
      <Button variant="secondary" onPress={refresh}>
        <Text>Check again</Text>
      </Button>
      <UnpairDialog onUnpair={forget} />
    </Screen>
  );
}
