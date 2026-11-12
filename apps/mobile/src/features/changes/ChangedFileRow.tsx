import type { ChangedFile } from '@mesa/core/phone';
import Check from 'lucide-react-native/icons/check';
import Circle from 'lucide-react-native/icons/circle';
import { Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** One changed file: its path, lines added and removed, and a check to mark it viewed. */
export function ChangedFileRow({
  file,
  viewed,
  onPress,
  onToggleViewed,
}: {
  file: ChangedFile;
  viewed: boolean;
  onPress: () => void;
  onToggleViewed: () => void;
}) {
  const counts = `+${file.added} -${file.removed}`;
  return (
    <View className="flex-row items-center bg-background">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${file.path}, ${file.added} added, ${file.removed} removed${viewed ? ', viewed' : ''}`}
        onPress={onPress}
        className="min-h-14 flex-1 justify-center gap-0.5 py-2 pl-4 active:bg-accent"
      >
        <Text
          numberOfLines={1}
          ellipsizeMode="head"
          className={cn('font-mono text-sm', viewed && 'text-muted-foreground')}
        >
          {file.path}
        </Text>
        <Text className="font-mono text-xs">
          <Text className="font-mono text-xs text-state-done">+{file.added}</Text>{' '}
          <Text className="font-mono text-xs text-destructive">-{file.removed}</Text>
        </Text>
      </Pressable>
      <Button
        variant="ghost"
        size="icon"
        accessibilityLabel={viewed ? `Mark ${file.path} not viewed` : `Mark ${file.path} viewed`}
        accessibilityHint={counts}
        onPress={onToggleViewed}
      >
        <Icon
          as={viewed ? Check : Circle}
          className={cn('size-5', viewed ? 'text-state-done' : 'text-muted-foreground')}
        />
      </Button>
    </View>
  );
}
