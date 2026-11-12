import type { QueuedMessage } from '@mesa/core/phone';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useUnqueue } from './useUnqueue';

/** Replies waiting for the session's turn to end, each editable and removable until typed. */
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
    <View className="gap-3">
      {queued.map((message) => (
        <View key={message.id} className="flex-row items-start gap-2">
          <View className="flex-1 gap-1">
            <Text numberOfLines={4}>{message.text}</Text>
            {message.error ? (
              <Text variant="muted" className="text-destructive">
                Not sent: {message.error}
              </Text>
            ) : null}
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
