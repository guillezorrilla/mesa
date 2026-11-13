import { type ReactNode, useRef } from 'react';
import { ScrollView, type ScrollViewInstance, View } from 'react-native';
import { Text } from '@/components/ui/text';

/**
 * A terminal's screen: `header` above its output, as native mono text that follows the newest
 * line, selectable to copy.
 */
export function TerminalOutput({ lines, header }: { lines: string[]; header: ReactNode }) {
  const scroll = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={scroll}
      className="flex-1 bg-background"
      contentContainerClassName="gap-3 p-4"
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
    >
      {header}
      <View className="min-h-64 rounded-xl border border-border bg-muted px-3 py-2.5">
        {lines.length ? (
          <Text selectable className="font-mono text-xs leading-5 text-foreground">
            {lines.join('\n')}
          </Text>
        ) : (
          <Text variant="muted" className="font-mono text-xs">
            No output yet.
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
