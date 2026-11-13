import type { PhoneStep } from '@mesa/core/phone';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import FilePen from 'lucide-react-native/icons/file-pen';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { pathParts } from '@/lib/pathParts';
import { cn } from '@/lib/utils';

/**
 * One file edit in a run, as orca's diff card header: the file's name with its lines added and
 * removed; a tap opens its diff in the diff viewer (`onOpen`).
 */
export function EditLine({
  step,
  onOpen,
}: {
  step: Extract<PhoneStep, { type: 'edit' }>;
  onOpen: (path: string) => void;
}) {
  const failed = step.status === 'failed';
  return (
    <Pressable
      onPress={() => onOpen(step.path)}
      accessibilityRole="button"
      accessibilityLabel={`Edited ${step.path}, ${step.added} added, ${step.removed} removed`}
      accessibilityHint="Opens its diff"
      className="min-h-[26px] flex-row items-center gap-2 active:opacity-70"
    >
      <Icon
        as={FilePen}
        className={cn('size-[15px]', failed ? 'text-destructive' : 'text-muted-foreground')}
      />
      <Text numberOfLines={1} className="shrink text-sm">
        <Text className="text-sm text-muted-foreground">Edited </Text>
        {pathParts(step.path).name}
      </Text>
      <Text className="font-mono text-xs text-state-done">+{step.added}</Text>
      <Text className="font-mono text-xs text-state-failed">-{step.removed}</Text>
      <Icon as={ChevronRight} className="ml-auto size-3.5 text-muted-foreground" />
    </Pressable>
  );
}
