import type { PhonePrDetail } from '@mesa/core/phone';
import { router } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ChangeMeter } from '../changes/ChangeMeter';
import { filesText } from './prText';

/** The PR's size up front, as orca's changes card shows it: files changed and lines added and
 *  removed, one tap from the file list in the Changes diff viewer. */
export function FilesLink({ pr }: { pr: PhonePrDetail }) {
  const title = filesText(pr.files);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${pr.additions} added, ${pr.deletions} removed`}
      onPress={() =>
        router.push({
          pathname: '/work/pr-files',
          params: { project: pr.project, number: String(pr.number) },
        })
      }
      className="min-h-16 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:bg-accent"
    >
      <View className="flex-1 gap-1.5">
        <Text className="font-semibold">{title}</Text>
        <View className="flex-row items-center gap-3">
          <ChangeMeter added={pr.additions} removed={pr.deletions} />
          <Text className="font-mono text-sm text-state-done">+{pr.additions}</Text>
          <Text className="font-mono text-sm text-destructive">-{pr.deletions}</Text>
        </View>
      </View>
      <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
    </Pressable>
  );
}
