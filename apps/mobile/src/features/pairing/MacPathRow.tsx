import type { MacPath } from '@mesa/core/phone';
import Cloud from 'lucide-react-native/icons/cloud';
import Network from 'lucide-react-native/icons/network';
import Wifi from 'lucide-react-native/icons/wifi';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { macPathText } from '../mac/macPathText';

const ICONS = { lan: Wifi, tailscale: Network, relay: Cloud } as const;

/** Which path the phone takes to this Mac: direct on its network, or the relay. */
export function MacPathRow({ path }: { path: MacPath }) {
  const { label, spoken } = macPathText(path);
  const tone = path === 'relay' ? 'text-muted-foreground' : 'text-state-idle';
  return (
    <View
      accessible
      accessibilityLabel={`Connection: ${spoken}`}
      className="flex-row items-center justify-between gap-x-4 py-2"
    >
      <Text className="text-muted-foreground">Connection</Text>
      <View className="flex-row items-center gap-1.5">
        <Icon as={ICONS[path]} className={cn('size-4', tone)} />
        <Text className={cn('text-sm font-medium', tone)}>{label}</Text>
      </View>
    </View>
  );
}
