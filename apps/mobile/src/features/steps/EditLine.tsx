import type { PhoneStep } from '@mesa/core/phone';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import FilePen from 'lucide-react-native/icons/file-pen';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { pathParts } from '@/lib/pathParts';
import { cn } from '@/lib/utils';
import { StepDetail } from './StepDetail';
import { failed as hasFailed } from './stepWords';
import { useOpenEdit } from './useOpenEdit';

/**
 * One file edit in session `id`'s run, as orca's diff card header: the file's name with its lines
 * added and removed; a tap opens its diff in the diff viewer, or, when the file no longer differs
 * from the base, the edit's own lines below it.
 */
export function EditLine({ id, step }: { id: string; step: Extract<PhoneStep, { type: 'edit' }> }) {
  const openEdit = useOpenEdit(id);
  const [inline, setInline] = useState(false);
  const failed = hasFailed(step);
  return (
    <View className="gap-1.5">
      <Pressable
        onPress={() =>
          inline ? setInline(false) : void openEdit(step.path).then((opened) => setInline(!opened))
        }
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
        <Icon
          as={ChevronRight}
          className={cn('ml-auto size-3.5 text-muted-foreground', inline && 'rotate-90')}
        />
      </Pressable>
      {inline ? (
        <View className="ml-6 gap-1">
          <Text className="text-xs text-muted-foreground">
            No change against the base now. The edit:
          </Text>
          <StepDetail id={id} step={step.id} />
        </View>
      ) : null}
    </View>
  );
}
