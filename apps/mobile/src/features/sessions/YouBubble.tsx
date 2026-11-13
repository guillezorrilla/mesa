import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * The person's message as plain text in a raised bubble on the right, as orca's (userBubble); one
 * still on its way is faint and says so.
 */
export function YouBubble({ text, sending }: { text: string; sending?: boolean }) {
  return (
    <View
      className={cn(
        'max-w-[88%] self-end rounded-2xl border border-border bg-secondary px-3 py-2',
        sending && 'opacity-60',
      )}
      accessibilityLabel={`${sending ? 'Sending' : 'You'}: ${text}`}
    >
      <Text selectable className="leading-6">
        {text}
      </Text>
      {sending ? <Text className="self-end text-xs text-muted-foreground">Sending</Text> : null}
    </View>
  );
}
