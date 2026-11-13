import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** How many of the output's last lines show until the card is opened. */
const SHUT = 4;

/**
 * The last lines of the session's output log as its terminal printed them, at the bottom of the
 * conversation: its last few lines, all of them once tapped open.
 */
export function OutputTail({ lines }: { lines: string[] }) {
  const [open, setOpen] = useState(false);
  if (!lines.length) return null;
  const shown = open ? lines : lines.slice(-SHUT);
  return (
    <View className="overflow-hidden rounded-xl border border-border bg-card">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={
          open ? 'Output, show fewer lines' : `Output, show all ${lines.length} lines`
        }
        className="flex-row items-center gap-2 border-b border-border px-3 py-2 active:opacity-70"
      >
        <Text className="flex-1 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
          Output · {open ? `${lines.length} lines` : `last ${shown.length} of ${lines.length}`}
        </Text>
        <Icon as={open ? ChevronUp : ChevronDown} className="size-4 text-muted-foreground" />
      </Pressable>
      <ScrollView horizontal contentContainerClassName="px-3 py-2.5">
        <Text selectable className="font-mono text-xs leading-5">
          {shown.join('\n')}
        </Text>
      </ScrollView>
    </View>
  );
}
