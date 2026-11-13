import type { PhoneStep } from '@mesa/core/phone';
import Check from 'lucide-react-native/icons/check';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { EditLine } from './EditLine';
import { StepLine } from './StepLine';
import { stepIcon } from './stepIcon';
import { failed as hasFailed, running, runSentence } from './stepWords';

/**
 * What the agent did in one gap of session `id`'s conversation, as orca's tool run: one muted
 * line saying it in a sentence, a check once all are done, shut until tapped; open, each step on
 * its own line along a rail.
 */
export function StepRun({ id, steps }: { id: string; steps: PhoneStep[] }) {
  const [open, setOpen] = useState(false);
  const first = steps[0];
  const failed = steps.filter(hasFailed).length;
  const done = !steps.some(running);
  if (!first) return null;
  return (
    <View className="gap-1">
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="min-h-8 flex-row items-center gap-2 active:opacity-70"
      >
        <Icon as={stepIcon(first)} className="size-[15px] text-muted-foreground" />
        <Text numberOfLines={1} className="shrink text-sm text-muted-foreground">
          {runSentence(steps)}
        </Text>
        {failed ? <Text className="text-xs text-destructive">{failed} failed</Text> : null}
        {done && !failed ? <Icon as={Check} className="size-3 text-muted-foreground" /> : null}
        <Icon
          as={ChevronRight}
          className={cn('size-3.5 text-muted-foreground', open && 'rotate-90')}
        />
      </Pressable>
      {open ? (
        <View className="ml-[7px] gap-0.5 border-l border-border pl-[13px]">
          {steps.map((step) =>
            step.type === 'edit' ? (
              <EditLine key={step.id} id={id} step={step} />
            ) : (
              <StepLine key={step.id} id={id} step={step} />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}
