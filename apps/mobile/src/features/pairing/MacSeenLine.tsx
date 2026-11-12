import type { PairingInfo } from '@mesa/core/phone';
import { use } from 'react';
import { Text } from '@/components/ui/text';
import { macSeenText } from './macSeenText';

/** The Mac's last check-in, once the broker answers (under a Suspense boundary). */
export function MacSeenLine({ info }: { info: Promise<PairingInfo | 'unreachable'> }) {
  return <Text className="text-muted-foreground">{macSeenText(use(info))}</Text>;
}
