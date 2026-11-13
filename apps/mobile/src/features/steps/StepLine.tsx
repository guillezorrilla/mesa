import type { PhoneStep } from '@mesa/core/phone';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { StepDetail } from './StepDetail';
import { stepIcon } from './stepIcon';
import { stepLabel } from './stepWords';

/**
 * One tool call or thought in a run, as orca's tool line: its mark, a muted verb and its target
 * on one line; a tap opens what it printed or thought (StepDetail).
 */
export function StepLine({ id, step }: { id: string; step: PhoneStep }) {
  const [open, setOpen] = useState(false);
  const { verb, target } = stepLabel(step);
  const failed = step.type !== 'thought' && step.status === 'failed';
  return (
    <View className="gap-1.5">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${verb} ${target}${failed ? ', failed' : ''}`}
        className="min-h-[26px] flex-row items-center gap-2 active:opacity-70"
      >
        <Icon
          as={stepIcon(step)}
          className={cn('size-[15px]', failed ? 'text-destructive' : 'text-muted-foreground')}
        />
        <Text numberOfLines={1} className="flex-1 text-sm">
          <Text className="text-sm text-muted-foreground">{verb} </Text>
          {target}
        </Text>
        <Icon
          as={ChevronRight}
          className={cn('size-3.5 text-muted-foreground', open && 'rotate-90')}
        />
      </Pressable>
      {open ? (
        <View className="ml-6">
          <StepDetail id={id} step={step.id} />
        </View>
      ) : null}
    </View>
  );
}
