import type { ChangedFile } from '@mesa/core/phone';
import Check from 'lucide-react-native/icons/check';
import Circle from 'lucide-react-native/icons/circle';
import { Pressable, View } from 'react-native';
import { PathText } from '@/components/PathText';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { ChangeMeter } from './ChangeMeter';
import { changedFileLabel, viewedToggleLabel } from './changedFileLabel';

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
  return (
    <View className="flex-row items-center bg-background">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={changedFileLabel(file, viewed)}
        onPress={onPress}
        className="min-h-14 flex-1 justify-center gap-1 py-2.5 pl-4 active:bg-accent"
      >
        <PathText path={file.path} muted={viewed} />
        <View className="flex-row items-center gap-2">
          <ChangeMeter added={file.added} removed={file.removed} />
          <Text className="font-mono text-xs text-state-done">+{file.added}</Text>
          <Text className="font-mono text-xs text-destructive">-{file.removed}</Text>
        </View>
      </Pressable>
      <Button
        variant="ghost"
        size="icon"
        accessibilityLabel={viewedToggleLabel(file.path, viewed)}
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
