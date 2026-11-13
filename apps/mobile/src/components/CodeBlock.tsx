import * as Clipboard from 'expo-clipboard';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * A block of code as orca's card (MobileMarkdownCodeBlock): a header row with a copy button over
 * the code, scrolled sideways rather than wrapped.
 */
export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
  };
  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-muted">
      <View className="min-h-8 flex-row items-center justify-end border-b border-border px-1">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy code'}
          onPress={copy}
          hitSlop={10}
          className="size-6 items-center justify-center rounded-full active:opacity-70"
        >
          <Icon
            as={copied ? Check : Copy}
            className={copied ? 'size-3.5 text-state-done' : 'size-3.5 text-muted-foreground'}
          />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="p-3">
        <Text selectable className="font-mono text-sm leading-5">
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}
