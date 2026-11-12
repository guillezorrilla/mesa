import * as Clipboard from 'expo-clipboard';
import Check from 'lucide-react-native/icons/check';
import Copy from 'lucide-react-native/icons/copy';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** A block of code, scrolled sideways rather than wrapped, with a button that copies it. */
export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
  };
  return (
    <View className="overflow-hidden rounded-lg border border-border bg-muted">
      <ScrollView horizontal contentContainerClassName="p-3 pr-14">
        <Text selectable className="font-mono text-sm">
          {code}
        </Text>
      </ScrollView>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0"
        accessibilityLabel={copied ? 'Copied' : 'Copy code'}
        onPress={copy}
      >
        <Icon as={copied ? Check : Copy} className="size-4 text-muted-foreground" />
      </Button>
    </View>
  );
}
