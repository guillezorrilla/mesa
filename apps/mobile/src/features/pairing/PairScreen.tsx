import { startTransition, useActionState, useEffect, useEffectEvent } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import { haptic } from '@/lib/haptics';
import { joinWithLink } from './joinWithLink';
import { PasteLinkField } from './PasteLinkField';
import { ScannerPanel } from './ScannerPanel';
import { usePairing } from './usePairing';

/**
 * Pair with a Mac: scan its code (or paste its link); `link` comes from a scanned mesa:// URL,
 * and `onPaired` leaves the screen once paired (pairing another Mac).
 */
export function PairScreen({ link, onPaired }: { link?: string; onPaired?: () => void }) {
  const { save } = usePairing();
  const [error, join, pending] = useActionState(async (_last: string | undefined, text: string) => {
    const result = await joinWithLink(fetch, text, new Date(), haptic);
    // VoiceOver hears the outcome; the screen changes under the person's finger otherwise.
    AccessibilityInfo.announceForAccessibility(result.error ?? 'Paired with your Mac.');
    if (result.pairing) {
      await save(result.pairing);
      onPaired?.();
    }
    return result.error;
  }, undefined);
  const submit = (text: string) => startTransition(() => join(text));

  // A link the system opened the app with pairs at once, as a scan would.
  const pairFromLink = useEffectEvent((text: string) => submit(text));
  useEffect(() => {
    if (link) pairFromLink(link);
  }, [link]);

  return (
    <Screen className="gap-6">
      <View className="gap-2">
        <Text variant="h3">Pair with your Mac</Text>
        <Text className="text-muted-foreground">
          On your Mac, open Mesa's Settings, then Phone, and choose Pair phone. Scan the code it
          shows.
        </Text>
      </View>
      <ScannerPanel onScan={submit} paused={pending} />
      {pending ? (
        <BusyLine label="Pairing with your Mac..." />
      ) : (
        error && <ErrorNote text={error} />
      )}
      <PasteLinkField onSubmit={submit} pending={pending} />
    </Screen>
  );
}
