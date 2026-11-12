import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { percent } from './adviceText';

/** One option's probability as a percent over a bar; the model's pick in the waiting colour. */
export function OddsRow({ label, p, picked }: { label: string; p: number; picked: boolean }) {
  return (
    <View accessible accessibilityLabel={`${label}, ${percent(p)}`} className="gap-1">
      <View className="flex-row justify-between gap-3">
        <Text numberOfLines={2} className={cn('flex-1', picked && 'font-semibold')}>
          {label}
        </Text>
        <Text className="font-mono text-sm text-muted-foreground">{percent(p)}</Text>
      </View>
      <View className="h-1.5 overflow-hidden rounded-full bg-muted">
        <View
          className={cn(
            'h-full rounded-full',
            picked ? 'bg-state-waiting' : 'bg-muted-foreground/40',
          )}
          style={{ width: `${Math.round(p * 100)}%` }}
        />
      </View>
    </View>
  );
}
