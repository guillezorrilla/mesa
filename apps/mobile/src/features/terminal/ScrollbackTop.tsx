import * as Clipboard from 'expo-clipboard';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * The top of the scrollback: older lines loading, or the start of the output once there are
 * none, and a button that copies every line shown (`text`), as orca's Select All and Copy.
 */
export function ScrollbackTop({
  loading,
  more,
  text,
}: {
  loading: boolean;
  more: boolean;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(text);
    setCopied(true);
  };
  return (
    <View className="flex-row items-center gap-2 pb-2">
      <View className="flex-1 flex-row items-center gap-2">
        {loading ? <ActivityIndicator size="small" /> : null}
        <Text className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          {loading ? 'Loading older output' : more ? '' : 'Start of output'}
        </Text>
      </View>
      {text ? (
        <Pressable
          onPress={copy}
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Copied' : 'Copy all output'}
          hitSlop={8}
          className="flex-row items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 active:opacity-70"
        >
          <Icon as={copied ? Check : Copy} className="size-3.5 text-foreground" />
          <Text className="text-xs font-medium">{copied ? 'Copied' : 'Copy all'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
