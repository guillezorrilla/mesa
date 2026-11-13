import type { PhonePairing } from '@mesa/core/phone';
import Monitor from 'lucide-react-native/icons/monitor';
import { Suspense } from 'react';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { InfoRow } from '@/components/InfoRow';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { macLabel } from '../mac/macLabel';
import { useMacPath } from '../mac/useMacPath';
import { usePushRegistration } from '../push/usePushRegistration';
import { MacPathRow } from './MacPathRow';
import { MacSeenLine } from './MacSeenLine';
import { UnpairButton } from './UnpairButton';
import { useMacInfo } from './useMacInfo';
import { usePairing } from './usePairing';

/**
 * One paired Mac: its name, when it last checked in, the path to it, its pairing, Check again and
 * Unpair, which ends this pairing alone. Registers this phone for that Mac's pushes.
 */
export function MacCard({ pairing }: { pairing: PhonePairing }) {
  usePushRegistration(pairing);
  const { forget } = usePairing();
  const { info, refresh, checking } = useMacInfo(pairing);
  const name = macLabel(pairing);
  const path = useMacPath(pairing.pairingId);
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="flex-row items-center gap-2.5 px-4">
        <Icon as={Monitor} className="size-5 text-state-idle" />
        <CardTitle numberOfLines={1} className="flex-1 text-lg">
          {name}
        </CardTitle>
      </CardHeader>
      <CardContent className="gap-2 px-4">
        <Suspense fallback={<BusyLine label="Asking the broker..." />}>
          <MacSeenLine info={info} />
        </Suspense>
        <Separator />
        {path ? <MacPathRow path={path} /> : null}
        <InfoRow label="Pairing" value={pairing.pairingId} />
        <View className="flex-row gap-2 pt-1">
          <Button size="sm" variant="secondary" disabled={checking} onPress={refresh}>
            <Text>{checking ? 'Checking...' : 'Check again'}</Text>
          </Button>
          <UnpairButton name={name} onUnpair={() => forget(pairing.pairingId)} />
        </View>
      </CardContent>
    </Card>
  );
}
