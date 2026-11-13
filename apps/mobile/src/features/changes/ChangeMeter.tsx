import { View } from 'react-native';
import { cn } from '@/lib/utils';
import { changeBlocks } from './changeBlocks';

const FILL = { add: 'bg-state-done', del: 'bg-destructive', none: 'bg-border' };

/** Five small blocks: a file's share of added and removed lines, at a glance. */
export function ChangeMeter({ added, removed }: { added: number; removed: number }) {
  return (
    <View className="flex-row gap-0.5" accessible={false}>
      {changeBlocks(added, removed).map((block, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the meter is five fixed blocks.
        <View key={at} className={cn('size-2 rounded-[1px]', FILL[block])} />
      ))}
    </View>
  );
}
