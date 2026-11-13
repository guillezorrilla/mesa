import type { QueuedMessage } from '@mesa/core/phone';
import Clock from 'lucide-react-native/icons/clock';
import Pencil from 'lucide-react-native/icons/pencil';
import Trash2 from 'lucide-react-native/icons/trash-2';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useUnqueue } from './useUnqueue';

/**
 * Replies waiting for the session's turn to end, the person's bubbles outlined dashed as not yet
 * delivered, each editable and removable until typed; one that could not be typed says why.
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
    <View className="gap-1.5">
      {queued.map((message) => (
        <View
          key={message.id}
          className="max-w-[85%] gap-1 self-end rounded-2xl rounded-br-md border border-dashed border-muted-foreground/50 py-2 pr-1 pl-3.5"
        >
          <Text numberOfLines={4}>{message.text}</Text>
          <View className="flex-row items-center gap-1">
            <Icon as={Clock} className="size-3.5 text-muted-foreground" />
            <Text
              className={cn(
                'flex-1 text-xs text-muted-foreground',
                message.error && 'text-destructive',
              )}
            >
              {message.error ? `Not sent: ${message.error}` : 'Sent when this turn ends'}
            </Text>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onPress={() => edit(message.id, message.text)}
              accessibilityLabel="Edit this queued reply"
            >
              <Icon as={Pencil} className="size-4 text-muted-foreground" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-8"
              onPress={() => remove(message.id)}
              accessibilityLabel="Remove this queued reply"
            >
              <Icon as={Trash2} className="size-4 text-muted-foreground" />
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
}
