import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import type { ChatItem } from './chatItems';
import { groupLabel } from './labelText';

/** Who speaks in a group of messages and when it started, small over its first message. */
export function GroupLabel({ item, now }: { item: ChatItem; now: number }) {
  return (
    <Text
      className={cn(
        'font-mono text-[11px] tracking-wider text-muted-foreground uppercase',
        item.from === 'you' && 'self-end',
      )}
    >
      {groupLabel(item.from, item.at, now)}
    </Text>
  );
}
