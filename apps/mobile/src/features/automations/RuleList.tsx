import type { PhoneRule } from '@mesa/core/phone';
import { Fragment } from 'react';
import { View } from 'react-native';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { RuleRow } from './RuleRow';

/** The profile's rules on one card, or a line saying there are none yet. */
export function RuleList({ rules, onChanged }: { rules: PhoneRule[]; onChanged: () => void }) {
  if (!rules.length)
    return <Text variant="muted">No rules yet. Add a schedule with the + above.</Text>;
  return (
    <View className="rounded-xl border border-border bg-card px-4">
      {rules.map((rule, index) => (
        <Fragment key={rule.name}>
          {index ? <Separator /> : null}
          <RuleRow rule={rule} onChanged={onChanged} />
        </Fragment>
      ))}
    </View>
  );
}
