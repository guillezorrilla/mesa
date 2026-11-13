import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** The person's message, a bubble on the right; one still on its way is faint and says so. */
export function YouBubble({ text, sending }: { text: string; sending?: boolean }) {
  return (
    <View
      className={cn(
        'max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2',
        sending && 'opacity-60',
      )}
      accessibilityLabel={`${sending ? 'Sending' : 'You'}: ${text}`}
    >
      <Text selectable className="text-primary-foreground">
        {text}
      </Text>
      {sending ? <Text className="self-end text-xs text-primary-foreground">Sending</Text> : null}
    </View>
  );
}
