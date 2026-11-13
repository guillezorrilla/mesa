import { use } from 'react';
import { Text } from '@/components/ui/text';
import { macSeenText } from './macSeenText';
import type { MacInfo } from './useMacInfo';

/** The Mac's last check-in, once the broker answers (under a Suspense boundary). */
export function MacSeenLine({ info }: { info: Promise<MacInfo> }) {
  return <Text className="text-muted-foreground">{macSeenText(use(info))}</Text>;
}
