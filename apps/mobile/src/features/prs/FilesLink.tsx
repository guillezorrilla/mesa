import type { PhonePrDetail } from '@mesa/core/phone';
import { router } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/** The PR's changed files, opened in the Changes diff viewer. */
export function FilesLink({ pr }: { pr: PhonePrDetail }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: '/work/pr-files',
          params: { project: pr.project, number: String(pr.number) },
        })
      }
      className="min-h-12 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 active:bg-accent"
    >
      <Text className="flex-1 font-medium">Files changed</Text>
      <Icon as={ChevronRight} className="size-5 text-muted-foreground" />
    </Pressable>
  );
}
