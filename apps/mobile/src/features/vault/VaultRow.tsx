import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/**
 * One row of a vault list: a mono stamp (a day, a kind) in the margin, its title and a muted line
 * under it, and a chevron when it opens something; the first row draws no hairline above it.
 */
export function VaultRow({
  title,
  detail,
  stamp,
  first,
  onPress,
}: {
  title: string;
  detail?: string;
  stamp?: string;
  first: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={[title, stamp, detail].filter(Boolean).join(', ')}
      disabled={!onPress}
      onPress={onPress}
      className={cn(
        'min-h-12 flex-row items-center gap-3 py-3 active:opacity-70',
        !first && 'border-t border-border',
      )}
    >
      {stamp ? <Text className="w-20 font-mono text-xs text-muted-foreground">{stamp}</Text> : null}
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={2}>{title}</Text>
        {detail ? (
          <Text variant="muted" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onPress ? <Icon as={ChevronRight} className="size-4 text-muted-foreground" /> : null}
    </Pressable>
  );
}
