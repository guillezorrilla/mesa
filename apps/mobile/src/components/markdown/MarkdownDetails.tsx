import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { MarkdownInline } from './MarkdownInline';
import type { Inline } from './markdownNodes';

/** A `<details>` section: its summary on a raised bar, closed unless written `open`, as GitHub and
 *  orca draw it; a tap opens or closes it. */
export function MarkdownDetails({
  summary,
  open,
  children,
}: {
  summary: Inline[];
  open: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(open);
  return (
    <View className="overflow-hidden rounded-lg border border-border">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded(!expanded)}
        className="min-h-11 flex-row items-center gap-2 bg-muted px-3 py-2 active:bg-accent"
      >
        <Icon
          as={ChevronRight}
          className={cn('size-4 text-muted-foreground', expanded && 'rotate-90')}
        />
        <Text className="shrink font-medium">
          {summary.length ? <MarkdownInline nodes={summary} /> : 'Details'}
        </Text>
      </Pressable>
      {expanded ? <View className="border-t border-border p-3">{children}</View> : null}
    </View>
  );
}
