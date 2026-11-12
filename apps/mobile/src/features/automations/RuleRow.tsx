import type { PhoneRule } from '@mesa/core/phone';
import { startTransition, useOptimistic } from 'react';
import { Switch, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { useSetRule } from './useSetRule';

/** A rule as its sentence, its name and project, and a switch that turns it on or off at once. */
export function RuleRow({ rule, onChanged }: { rule: PhoneRule; onChanged: () => void }) {
  const [error, setRule] = useSetRule(rule.name, onChanged);
  const [enabled, showEnabled] = useOptimistic(rule.enabled);
  return (
    <View className="gap-2 py-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1">
          <Text className={cn('leading-snug', !enabled && 'text-muted-foreground')}>
            {rule.sentence}
          </Text>
          <Text variant="muted" numberOfLines={1}>
            {rule.name} · {rule.project}
          </Text>
        </View>
        <Switch
          value={enabled}
          accessibilityLabel={`${rule.name}, ${enabled ? 'on' : 'off'}`}
          onValueChange={(on) =>
            startTransition(() => {
              showEnabled(on);
              setRule(on);
            })
          }
        />
      </View>
      {error ? <ErrorNote text={error} /> : null}
    </View>
  );
}
