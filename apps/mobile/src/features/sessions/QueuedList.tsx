import type { QueuedMessage } from '@mesa/core/phone';
import Clock from 'lucide-react-native/icons/clock';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUnqueue } from './useUnqueue';

/**
 * Replies waiting for the session's turn to end, outlined dashed as not yet delivered, each
 * editable and removable until typed; one that could not be typed says why.
 */
export function QueuedList({
  id,
  queued,
  onChange,
}: {
  id: string;
  queued: QueuedMessage[];
  onChange: () => void;
}) {
  const { edit, remove } = useUnqueue(id, onChange);
  return (
    <View className="gap-2">
      {queued.map((message) => (
        <View
          key={message.id}
          className="flex-row items-start gap-1 rounded-xl border border-dashed border-border p-3 pr-1"
        >
          <Icon as={Clock} className="mt-0.5 mr-1.5 size-4 text-muted-foreground" />
          <View className="flex-1 gap-1">
            <Text numberOfLines={4}>{message.text}</Text>
            <Text variant="muted" className={message.error ? 'text-destructive' : undefined}>
              {message.error ? `Not sent: ${message.error}` : 'Sent when this turn ends'}
            </Text>
          </View>
          <Button
            size="icon"
            variant="ghost"
            onPress={() => edit(message.id, message.text)}
            accessibilityLabel="Edit this queued reply"
          >
            <Icon as={Pencil} className="size-5 text-muted-foreground" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onPress={() => remove(message.id)}
            accessibilityLabel="Remove this queued reply"
          >
            <Icon as={Trash2} className="size-5 text-muted-foreground" />
          </Button>
        </View>
      ))}
    </View>
  );
}
