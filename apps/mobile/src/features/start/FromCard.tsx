import Ticket from 'lucide-react-native/icons/ticket';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** The ticket a session starts from, its goal built from it on the Mac (`open --from`). */
export function FromCard({ title }: { title: string }) {
  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Icon as={Ticket} className="size-5 text-muted-foreground" />
      <View className="flex-1">
        <Text variant="muted" className="text-xs">
          Starts from
        </Text>
        <Text numberOfLines={2}>{title}</Text>
      </View>
    </View>
  );
}
